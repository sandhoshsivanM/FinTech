using Khazana.AccountAggregator.Application;
using Khazana.Security;

namespace Khazana.AccountAggregator.Api;

// Bodies are snake_case; byte arrays travel as standard base64.

public sealed record FetchRequest(Guid ConsentId);

public sealed record ErrorResponse(string Error);

public static class AaEndpoints
{
    /// <summary>A partner callback is a small JSON notification; anything bigger is refused unread.</summary>
    public const int MaxCallbackBytes = 64 * 1024;

    public static void MapAaEndpoints(this IEndpointRouteBuilder app)
    {
        var aa = app.MapGroup("/v1/aa").RequireAuthorization().AddEndpointFilter(MapErrors);
        aa.MapPost("/consents", Create);
        aa.MapGet("/consents", List);
        aa.MapGet("/consents/{id:guid}", Get);
        aa.MapDelete("/consents/{id:guid}", Revoke);
        aa.MapPost("/fetch", Fetch);
        aa.MapGet("/fetch/{id:guid}", FetchStatus);
        aa.MapGet("/inbox", Inbox);
        aa.MapPost("/inbox/{id:guid}/ack", Ack);

        // Signed partner callbacks: no user token, the signature is the authentication.
        app.MapPost("/v1/webhooks/aa", Callback).AllowAnonymous().AddEndpointFilter(MapErrors);
    }

    /// <summary>Consent request. The app asks for a biometric check before signing this request (§14.3).</summary>
    private static async Task<IResult> Create(CreateConsent body, HttpContext http, ConsentService svc, CancellationToken ct)
    {
        var consent = await svc.CreateAsync(http.User.UserId(), body, ct).ConfigureAwait(false);
        return Results.Created($"/v1/aa/consents/{consent.Id}", consent);
    }

    private static async Task<IResult> List(HttpContext http, ConsentService svc, CancellationToken ct) =>
        Results.Ok(await svc.ListAsync(http.User.UserId(), ct).ConfigureAwait(false));

    private static async Task<IResult> Get(Guid id, HttpContext http, ConsentService svc, CancellationToken ct) =>
        Results.Ok(await svc.GetAsync(http.User.UserId(), id, ct).ConfigureAwait(false));

    private static async Task<IResult> Revoke(Guid id, HttpContext http, ConsentService svc, CancellationToken ct)
    {
        await svc.RevokeAsync(http.User.UserId(), id, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> Fetch(FetchRequest body, HttpContext http, ConsentService svc, CancellationToken ct) =>
        Results.Accepted(value: await svc.FetchNowAsync(http.User.UserId(), body.ConsentId, ct).ConfigureAwait(false));

    private static async Task<IResult> FetchStatus(Guid id, HttpContext http, ConsentService svc, CancellationToken ct) =>
        Results.Ok(await svc.FetchStatusAsync(http.User.UserId(), id, ct).ConfigureAwait(false));

    private static async Task<IResult> Inbox(HttpContext http, ConsentService svc, CancellationToken ct) =>
        Results.Ok(await svc.InboxAsync(http.User.UserId(), ct).ConfigureAwait(false));

    private static async Task<IResult> Ack(Guid id, HttpContext http, ConsentService svc, CancellationToken ct)
    {
        await svc.AckAsync(http.User.UserId(), id, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> Callback(HttpContext http, ConsentService svc, CancellationToken ct)
    {
        if (http.Request.ContentLength is > MaxCallbackBytes) return Results.BadRequest(new ErrorResponse("too_large"));
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int read;
        while ((read = await http.Request.Body.ReadAsync(chunk, ct).ConfigureAwait(false)) > 0)
        {
            if (buffer.Length + read > MaxCallbackBytes) return Results.BadRequest(new ErrorResponse("too_large"));
            buffer.Write(chunk, 0, read);
        }
        await svc.HandleCallbackAsync(buffer.ToArray(), name => http.Request.Headers[name].FirstOrDefault(), ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    /// <summary>Turns a refusal into its status code and a bare error word. Details go to the log only.</summary>
    private static async ValueTask<object?> MapErrors(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            return await next(context).ConfigureAwait(false);
        }
        catch (AaException e)
        {
            Log.Refused(context.HttpContext.RequestServices.GetRequiredService<ILogger<ConsentService>>(), e.Message);
            return e.Error switch
            {
                AaError.NotFound => Results.Json(new ErrorResponse("not_found"), statusCode: StatusCodes.Status404NotFound),
                AaError.ConsentInactive => Results.Json(new ErrorResponse("consent_inactive"), statusCode: StatusCodes.Status409Conflict),
                AaError.Conflict => Results.Json(new ErrorResponse("conflict"), statusCode: StatusCodes.Status409Conflict),
                AaError.TooMany => Results.Json(new ErrorResponse("too_many"), statusCode: StatusCodes.Status409Conflict),
                AaError.Unauthorized => Results.Json(new ErrorResponse("unauthorized"), statusCode: StatusCodes.Status401Unauthorized),
                AaError.ProviderUnavailable => Results.Json(new ErrorResponse("provider_unavailable"), statusCode: StatusCodes.Status502BadGateway),
                _ => Results.BadRequest(new ErrorResponse("invalid_request")),
            };
        }
    }
}

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "AA request refused: {Reason}")]
    public static partial void Refused(ILogger logger, string reason);
}
