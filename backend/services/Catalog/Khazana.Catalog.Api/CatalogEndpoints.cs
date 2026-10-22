using System.Security.Cryptography;
using System.Text;
using Khazana.Catalog.Application;
using Khazana.Catalog.Domain;
using Wolverine;

namespace Khazana.Catalog.Api;

public sealed record CatalogResponse(long Version, string KeyId, byte[] Signature, byte[] Payload);

public sealed record PublicKeyResponse(string KeyId, string Alg, byte[] PublicKey);

public sealed record ErrorResponse(string Error);

public static class CatalogEndpoints
{
    public const string KeyHeader = "X-Khazana-Internal-Key";

    public static void MapCatalogEndpoints(this IEndpointRouteBuilder app)
    {
        // Public (through the gateway): the same signed bytes for everyone.
        app.MapGet("/v1/catalog", Latest);
        app.MapGet("/v1/catalog/keys", (ICatalogSigner signer) =>
            Results.Ok(new[] { new PublicKeyResponse(signer.KeyId, "Ed25519", signer.PublicKey) }));

        // Internal curation (never routed by the gateway; service key).
        var curation = app.MapGroup("/internal/catalog").AddEndpointFilter(RequireServiceKey);
        curation.MapGet("/offers", async (CatalogQueries queries, CancellationToken ct) =>
            Results.Ok(await queries.AllOffersAsync(ct).ConfigureAwait(false)));
        curation.MapPut("/offers/{id}", async (string id, Offer offer, CurationService svc, CancellationToken ct) =>
            offer.Id != id ? Results.BadRequest(new ErrorResponse("id_mismatch"))
            : await svc.SaveOfferAsync(offer, ct).ConfigureAwait(false) is { } problem ? Results.BadRequest(new ErrorResponse(problem))
            : Results.NoContent());
        curation.MapDelete("/offers/{id}", async (string id, CurationService svc, CancellationToken ct) =>
        {
            await svc.DeleteOfferAsync(id, ct).ConfigureAwait(false);
            return Results.NoContent();
        });
        curation.MapPut("/templates/{id}", async (string id, ParserTemplate template, CurationService svc, CancellationToken ct) =>
            template.Id != id ? Results.BadRequest(new ErrorResponse("id_mismatch"))
            : await svc.SaveTemplateAsync(template, ct).ConfigureAwait(false) is { } problem ? Results.BadRequest(new ErrorResponse(problem))
            : Results.NoContent());
        curation.MapDelete("/templates/{id}", async (string id, CurationService svc, CancellationToken ct) =>
        {
            await svc.DeleteTemplateAsync(id, ct).ConfigureAwait(false);
            return Results.NoContent();
        });
        curation.MapPost("/publish", async (IMessageBus bus, CancellationToken ct) =>
            Results.Ok(await bus.InvokeAsync<PublishResult>(new PublishCatalog(), ct).ConfigureAwait(false)));
    }

    /// <summary>
    /// The latest signed catalog. An app that already has this version gets 304
    /// and downloads nothing. It verifies <c>signature</c> over <c>payload</c>
    /// with a pinned key before reading a single field.
    /// </summary>
    private static async Task<IResult> Latest(long? since, HttpContext http, CatalogQueries queries, CancellationToken ct)
    {
        var latest = await queries.LatestAsync(ct).ConfigureAwait(false);
        if (latest is null) return Results.NotFound(new ErrorResponse("not_published"));
        http.Response.Headers.ETag = $"\"v{latest.Version}\"";
        http.Response.Headers.CacheControl = "public, max-age=300";
        if (since == latest.Version || Matches(http.Request.Headers.IfNoneMatch, latest.Version))
            return Results.StatusCode(StatusCodes.Status304NotModified);
        return Results.Ok(new CatalogResponse(latest.Version, latest.KeyId, latest.Signature, latest.Payload));
    }

    /// <summary>
    /// If-None-Match per RFC 9110: a list, weak tags (W/"v3"), or *. The ETag
    /// names a version whose bytes never change, so weak and strong mean the same.
    /// </summary>
    public static bool Matches(Microsoft.Extensions.Primitives.StringValues ifNoneMatch, long version)
    {
        var current = $"\"v{version}\"";
        foreach (var header in ifNoneMatch)
        {
            foreach (var raw in (header ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (raw == "*") return true;
                var tag = raw.StartsWith("W/", StringComparison.Ordinal) ? raw[2..] : raw;
                if (tag == current) return true;
            }
        }
        return false;
    }

    private static ValueTask<object?> RequireServiceKey(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = Encoding.UTF8.GetBytes(http.RequestServices.GetRequiredService<IConfiguration>()["Catalog:InternalKey"] ?? string.Empty);
        var presented = Encoding.UTF8.GetBytes(http.Request.Headers[KeyHeader].ToString());
        return expected.Length >= 32 && CryptographicOperations.FixedTimeEquals(SHA256.HashData(presented), SHA256.HashData(expected))
            ? next(context)
            : ValueTask.FromResult<object?>(Results.Unauthorized());
    }
}
