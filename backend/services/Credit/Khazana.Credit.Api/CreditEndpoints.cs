using Khazana.Credit.Application;
using Khazana.Security;

namespace Khazana.Credit.Api;

// Bodies are snake_case; byte arrays travel as standard base64.

public sealed record ErrorResponse(string Error, DateTimeOffset? NextAllowedAt = null);

public static class CreditEndpoints
{
    public static void MapCreditEndpoints(this IEndpointRouteBuilder app)
    {
        var credit = app.MapGroup("/v1/credit").RequireAuthorization().AddEndpointFilter(MapErrors);
        credit.MapPost("/report", Pull);
        credit.MapGet("/pulls", History);
        credit.MapDelete("/consent", Withdraw);
        credit.MapGet("/inbox", Inbox);
        credit.MapPost("/inbox/{id:guid}/ack", Ack);
    }

    /// <summary>A credit pull. The app shows the consent text and asks for a biometric check before signing this request (§14.3).</summary>
    private static async Task<IResult> Pull(PullRequest body, HttpContext http, CreditService svc, CancellationToken ct)
    {
        var result = await svc.PullAsync(http.User.UserId(), body, ct).ConfigureAwait(false);
        return Results.Created($"/v1/credit/inbox/{result.PayloadId}", result);
    }

    private static async Task<IResult> History(HttpContext http, CreditService svc, CancellationToken ct) =>
        Results.Ok(await svc.HistoryAsync(http.User.UserId(), ct).ConfigureAwait(false));

    private static async Task<IResult> Withdraw(HttpContext http, CreditService svc, CancellationToken ct)
    {
        await svc.WithdrawAsync(http.User.UserId(), ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> Inbox(HttpContext http, CreditService svc, CancellationToken ct) =>
        Results.Ok(await svc.InboxAsync(http.User.UserId(), ct).ConfigureAwait(false));

    private static async Task<IResult> Ack(Guid id, HttpContext http, CreditService svc, CancellationToken ct)
    {
        await svc.AckAsync(http.User.UserId(), id, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    /// <summary>Turns a refusal into its status code and a bare error word. Details go to the log only (and never a PAN).</summary>
    private static async ValueTask<object?> MapErrors(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            return await next(context).ConfigureAwait(false);
        }
        catch (CreditException e)
        {
            Log.Refused(context.HttpContext.RequestServices.GetRequiredService<ILogger<CreditService>>(), e.Message);
            return e.Error switch
            {
                CreditError.NotFound => Results.Json(new ErrorResponse("not_found"), statusCode: StatusCodes.Status404NotFound),
                CreditError.ConsentRequired => Results.Json(new ErrorResponse("consent_required"), statusCode: StatusCodes.Status403Forbidden),
                CreditError.TooSoon => Results.Json(new ErrorResponse("too_soon", e.NextAllowedAt), statusCode: StatusCodes.Status429TooManyRequests),
                CreditError.InProgress => Results.Json(new ErrorResponse("in_progress"), statusCode: StatusCodes.Status409Conflict),
                CreditError.ProviderUnavailable => Results.Json(new ErrorResponse("provider_unavailable"), statusCode: StatusCodes.Status502BadGateway),
                _ => Results.BadRequest(new ErrorResponse("invalid_request")),
            };
        }
    }
}

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "Credit request refused: {Reason}")]
    public static partial void Refused(ILogger logger, string reason);
}
