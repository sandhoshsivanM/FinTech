using Khazana.Devices.Application;
using Khazana.Security;
using Khazana.SharedKernel;

namespace Khazana.Devices.Api;

// Bodies are snake_case; byte arrays travel as standard base64.

public sealed record RegisterDevice(string Platform, byte[] PublicKey, string? Name = null, string? AppVersion = null);

public sealed record EnvelopeDto(byte[] WrappedDek, string Alg, int KeyVersion)
{
    public Envelope ToEnvelope() => new(WrappedDek, Alg, KeyVersion);

    public static EnvelopeDto From(Envelope e) => new(e.WrappedDek, e.Alg, e.KeyVersion);
}

public sealed record Bootstrap(EnvelopeDto Device, EnvelopeDto Recovery, byte[] KeyCheck);

public sealed record ProvenEnvelope(EnvelopeDto Envelope, byte[] KeyCheck);

public sealed record RenameDevice(string Name);

public sealed record ApprovePairing(string Code, EnvelopeDto Envelope);

public sealed record ErrorResponse(string Error);

public static class DeviceEndpoints
{
    public static void MapDeviceEndpoints(this IEndpointRouteBuilder app)
    {
        var devices = app.MapGroup("/v1/devices").RequireAuthorization().AddEndpointFilter(MapErrors);
        devices.MapPost("/register", Register);
        devices.MapGet("/", List);
        devices.MapGet("/me", Status);
        devices.MapPatch("/{id:guid}", Rename);
        devices.MapDelete("/{id:guid}", Revoke);
        devices.MapPost("/pairing", StartPairing);
        devices.MapGet("/pairing/{id:guid}", GetPairing);
        devices.MapPost("/pairing/{id:guid}/approve", Approve);

        var keys = app.MapGroup("/v1/keys").RequireAuthorization().AddEndpointFilter(MapErrors);
        keys.MapPost("/bootstrap", BootstrapKeys);
        keys.MapGet("/envelopes/self", OwnEnvelope);
        keys.MapPost("/envelopes/self", AddOwnEnvelope);
        keys.MapGet("/envelopes/recovery", RecoveryEnvelope);
        keys.MapPut("/envelopes/recovery", ReplaceRecovery);
    }

    private static Caller Caller(HttpContext http) =>
        new(http.User.UserId(), http.User.DeviceId(), http.User.DeviceKeyThumbprint());

    private static async Task<IResult> Register(RegisterDevice body, HttpContext http, DeviceKeyService svc, CancellationToken ct) =>
        Results.Ok(await svc.RegisterAsync(Caller(http), body.Name, body.Platform, body.AppVersion, body.PublicKey, ct).ConfigureAwait(false));

    private static async Task<IResult> Status(HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.RequireActiveAsync(Caller(http), ct).ConfigureAwait(false);
        return Results.Ok(await svc.StatusAsync(Caller(http), ct).ConfigureAwait(false));
    }

    private static async Task<IResult> List(HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.RequireActiveAsync(Caller(http), ct).ConfigureAwait(false);
        return Results.Ok(await svc.ListAsync(Caller(http), ct).ConfigureAwait(false));
    }

    private static async Task<IResult> Rename(Guid id, RenameDevice body, HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.RequireActiveAsync(Caller(http), ct).ConfigureAwait(false);
        await svc.RenameAsync(Caller(http), id, body.Name, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    /// <summary>
    /// Remote logout. It needs a step-up token: Identity issues one only after a
    /// passkey check in the last two minutes, so a stolen or left-open session
    /// cannot remove devices by itself.
    /// </summary>
    private static async Task<IResult> Revoke(Guid id, HttpContext http, DeviceKeyService svc, IClock clock, CancellationToken ct)
    {
        await svc.RequireActiveAsync(Caller(http), ct).ConfigureAwait(false);
        if (!http.User.HasRecentStepUp(clock.UtcNow))
            throw new DevicesException(DevicesError.StepUpRequired, "Revoking a device needs a recent passkey check.");
        await svc.RevokeAsync(Caller(http), id, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> StartPairing(HttpContext http, DeviceKeyService svc, CancellationToken ct) =>
        Results.Ok(await svc.StartPairingAsync(Caller(http), ct).ConfigureAwait(false));

    private static async Task<IResult> GetPairing(Guid id, HttpContext http, DeviceKeyService svc, CancellationToken ct) =>
        Results.Ok(await svc.GetPairingAsync(Caller(http), id, ct).ConfigureAwait(false));

    private static async Task<IResult> Approve(Guid id, ApprovePairing body, HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.ApprovePairingAsync(Caller(http), id, body.Code, body.Envelope.ToEnvelope(), ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> BootstrapKeys(Bootstrap body, HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.BootstrapAsync(Caller(http), body.Device.ToEnvelope(), body.Recovery.ToEnvelope(), body.KeyCheck, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> OwnEnvelope(HttpContext http, DeviceKeyService svc, CancellationToken ct) =>
        Results.Ok(EnvelopeDto.From(await svc.GetOwnEnvelopeAsync(Caller(http), ct).ConfigureAwait(false)));

    private static async Task<IResult> AddOwnEnvelope(ProvenEnvelope body, HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.AddOwnEnvelopeAsync(Caller(http), body.Envelope.ToEnvelope(), body.KeyCheck, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> RecoveryEnvelope(HttpContext http, DeviceKeyService svc, CancellationToken ct) =>
        Results.Ok(EnvelopeDto.From(await svc.GetRecoveryEnvelopeAsync(Caller(http), ct).ConfigureAwait(false)));

    private static async Task<IResult> ReplaceRecovery(ProvenEnvelope body, HttpContext http, DeviceKeyService svc, CancellationToken ct)
    {
        await svc.ReplaceRecoveryAsync(Caller(http), body.Envelope.ToEnvelope(), body.KeyCheck, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    /// <summary>Turns a refusal into its status code and a bare error word. Details go to the log only.</summary>
    private static async ValueTask<object?> MapErrors(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            return await next(context).ConfigureAwait(false);
        }
        catch (DevicesException e)
        {
            Log.Refused(context.HttpContext.RequestServices.GetRequiredService<ILogger<DeviceKeyService>>(), e.Message);
            return e.Error switch
            {
                DevicesError.Forbidden => Results.Json(new ErrorResponse("forbidden"), statusCode: StatusCodes.Status403Forbidden),
                DevicesError.StepUpRequired => Results.Json(new ErrorResponse("step_up_required"), statusCode: StatusCodes.Status403Forbidden),
                DevicesError.NotFound => Results.Json(new ErrorResponse("not_found"), statusCode: StatusCodes.Status404NotFound),
                DevicesError.Conflict => Results.Json(new ErrorResponse("conflict"), statusCode: StatusCodes.Status409Conflict),
                _ => Results.BadRequest(new ErrorResponse("invalid_request")),
            };
        }
    }
}

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "Devices request refused: {Reason}")]
    public static partial void Refused(ILogger logger, string reason);
}
