using Khazana.Security;
using Khazana.Sync.Application;
using Khazana.Sync.Domain;
using Wolverine;

namespace Khazana.Sync.Api;

public sealed record PushRecord(
    string RecordId, string Collection, DateTimeOffset ClientUpdatedAt, bool Deleted, byte[]? Ciphertext, int KeyVersion);

public sealed record PushRequest(IReadOnlyList<PushRecord?>? Records);

public sealed record ErrorResponse(string Error);

public static class SyncEndpoints
{
    public static void MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var sync = app.MapGroup("/v1/sync").RequireAuthorization().AddEndpointFilter(RequireActiveDevice);
        sync.MapPost("/push", Push).WithMetadata(new RequestSizeLimitMetadata(SyncRules.MaxPushBodyBytes));
        sync.MapGet("/pull", Pull);
        sync.MapPut("/attachments/{id}", PutAttachment).WithMetadata(new RequestSizeLimitMetadata(AttachmentRules.MaxBytes));
        sync.MapGet("/attachments/{id}", GetAttachment);
        sync.MapDelete("/attachments/{id}", DeleteAttachment);
    }

    /// <summary>Encrypted records in. The server stores them as they are; it can't read or merge them.</summary>
    private static async Task<IResult> Push(PushRequest body, HttpContext http, IMessageBus bus, CancellationToken ct)
    {
        // Null entries are passed on so validation reports them (400) instead of
        // throwing; times are converted to UTC, as Postgres timestamptz arrays require.
        var records = (body?.Records ?? []).Select(r => r is null ? null! : new IncomingRecord(
            r.RecordId, r.Collection, r.ClientUpdatedAt.ToUniversalTime(), r.Deleted, r.Ciphertext ?? [], r.KeyVersion)).ToList();
        if (SyncRules.Validate(records, DateTimeOffset.UtcNow) is not null)
            return Results.BadRequest(new ErrorResponse("invalid_request"));
        var result = await bus.InvokeAsync<PushResult>(
            new PushRecords(http.User.UserId(), http.User.DeviceId(), records), ct).ConfigureAwait(false);
        return Results.Ok(result);
    }

    /// <summary>Records after the cursor, oldest first. The device decrypts and merges them.</summary>
    /// <param name="epoch">The <c>epoch</c> from the previous page; 0 for a first pull.</param>
    private static async Task<IResult> Pull(long? since, long? epoch, int? limit, HttpContext http, SyncService sync, CancellationToken ct) =>
        Results.Ok(await sync.PullAsync(http.User.UserId(), since ?? 0, epoch ?? 0, limit ?? SyncRules.MaxPage, ct).ConfigureAwait(false));

    /// <summary>An encrypted file (up to 25 MB), streamed to the attachment store.</summary>
    private static async Task<IResult> PutAttachment(string id, HttpContext http, AttachmentService attachments, CancellationToken ct)
    {
        await attachments.PutAsync(http.User.UserId(), id, http.Request.Body, http.Request.ContentLength, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> GetAttachment(string id, HttpContext http, AttachmentService attachments, CancellationToken ct) =>
        await attachments.GetAsync(http.User.UserId(), id, ct).ConfigureAwait(false) is { } stream
            ? Results.Stream(stream, "application/octet-stream")
            : Results.NotFound(new ErrorResponse("not_found"));

    private static async Task<IResult> DeleteAttachment(string id, HttpContext http, AttachmentService attachments, CancellationToken ct)
    {
        await attachments.DeleteAsync(http.User.UserId(), id, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async ValueTask<object?> RequireActiveDevice(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        try
        {
            await http.RequestServices.GetRequiredService<SyncService>()
                .RequireActiveAsync(http.User.DeviceId(), http.RequestAborted).ConfigureAwait(false);
            return await next(context).ConfigureAwait(false);
        }
        catch (BadHttpRequestException)
        {
            // Over Kestrel's body limit for this endpoint.
            return Results.BadRequest(new ErrorResponse("too_large"));
        }
        catch (SyncException e)
        {
            Log.Refused(http.RequestServices.GetRequiredService<ILogger<SyncService>>(), e.Message);
            return e.Error switch
            {
                SyncError.Forbidden => Results.Json(new ErrorResponse("forbidden"), statusCode: StatusCodes.Status403Forbidden),
                SyncError.Unavailable => Results.Json(new ErrorResponse("attachments_unavailable"), statusCode: StatusCodes.Status503ServiceUnavailable),
                _ => Results.BadRequest(new ErrorResponse("invalid_request")),
            };
        }
    }
}

/// <summary>Per-endpoint body limit: sync batches are larger than anything else.</summary>
internal sealed class RequestSizeLimitMetadata(long limit) : Microsoft.AspNetCore.Http.Metadata.IRequestSizeLimitMetadata
{
    public long? MaxRequestBodySize => limit;
}

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "Sync request refused: {Reason}")]
    public static partial void Refused(ILogger logger, string reason);
}
