using Khazana.Notification.Application;
using Khazana.Security;

namespace Khazana.Notification.Api;

public sealed record RegisterPush(string Provider, string Token);

public sealed record ErrorResponse(string Error);

public static class PushEndpoints
{
    public static void MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        var push = app.MapGroup("/v1/push").RequireAuthorization();
        push.MapPost("/register", Register);
        push.MapDelete("/register", Unregister);
    }

    /// <summary>The calling device's FCM, APNs or Web Push token. One per device; a new one replaces the old.</summary>
    private static async Task<IResult> Register(RegisterPush body, HttpContext http, PushRegistrationService svc, CancellationToken ct) =>
        await svc.RegisterAsync(http.User.UserId(), http.User.DeviceId(), body.Provider, body.Token, ct).ConfigureAwait(false)
            ? Results.NoContent()
            : Results.BadRequest(new ErrorResponse("invalid_request"));

    private static async Task<IResult> Unregister(HttpContext http, PushRegistrationService svc, CancellationToken ct)
    {
        await svc.UnregisterAsync(http.User.UserId(), http.User.DeviceId(), ct).ConfigureAwait(false);
        return Results.NoContent();
    }
}
