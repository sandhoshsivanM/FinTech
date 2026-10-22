using System.Text.Json;
using Khazana.Catalog.Application.Persistence;
using Khazana.Catalog.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.Catalog.Application;

/// <summary>Signs catalog payloads. Ed25519; the private key never leaves the signer.</summary>
public interface ICatalogSigner
{
    /// <summary>Short id of the current key, so apps can hold several during a rotation.</summary>
    string KeyId { get; }

    byte[] PublicKey { get; }

    byte[] Sign(byte[] payload);
}

/// <summary>What the app downloads. <c>Payload</c> is the exact signed bytes: verify, then parse.</summary>
public sealed record SignedCatalog(long Version, string KeyId, byte[] Signature, byte[] Payload);

internal static class Json
{
    public static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
}

/// <summary>Curation: what the ops team edits (through the admin panel, later) before publishing.</summary>
public sealed class CurationService(CatalogDbContext db, IClock clock)
{
    /// <returns>Why the offer was refused, or null when stored.</returns>
    public async Task<string?> SaveOfferAsync(Offer offer, CancellationToken ct)
    {
        if (CatalogRules.Validate(offer) is { } problem) return problem;
        var row = await db.Offers.FirstOrDefaultAsync(o => o.Id == offer.Id, ct).ConfigureAwait(false);
        var doc = JsonSerializer.Serialize(offer, Json.Options);
        if (row is null) db.Offers.Add(new OfferRow { Id = offer.Id, Document = doc, UpdatedAt = clock.UtcNow });
        else
        {
            row.Document = doc;
            row.UpdatedAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return null;
    }

    public async Task<string?> SaveTemplateAsync(ParserTemplate template, CancellationToken ct)
    {
        if (CatalogRules.Validate(template) is { } problem) return problem;
        var row = await db.Templates.FirstOrDefaultAsync(t => t.Id == template.Id, ct).ConfigureAwait(false);
        var doc = JsonSerializer.Serialize(template, Json.Options);
        if (row is null) db.Templates.Add(new TemplateRow { Id = template.Id, Document = doc, UpdatedAt = clock.UtcNow });
        else
        {
            row.Document = doc;
            row.UpdatedAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return null;
    }

    public Task<int> DeleteOfferAsync(string id, CancellationToken ct) => db.Offers.Where(o => o.Id == id).ExecuteDeleteAsync(ct);

    public Task<int> DeleteTemplateAsync(string id, CancellationToken ct) => db.Templates.Where(t => t.Id == id).ExecuteDeleteAsync(ct);
}

/// <summary>Publish a new catalog version if anything changed (internal command; daily, and on demand).</summary>
public sealed record PublishCatalog;

public sealed record PublishResult(long Version, bool Changed);

/// <summary>
/// Builds the snapshot from live offers (today inside their validity) and every
/// template, signs it, stores the version, and announces it, in one
/// transaction. Nothing changed means no new version, so apps don't download
/// the same catalog again.
/// </summary>
public static class PublishCatalogHandler
{
    public static async Task<(PublishResult, OutgoingMessages)> Handle(
        PublishCatalog command, CatalogDbContext db, ICatalogSigner signer, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(signer);
        ArgumentNullException.ThrowIfNull(clock);
        var now = clock.UtcNow;
        var today = DateOnly.FromDateTime(IndiaTime.ToIst(now).DateTime);

        var offers = (await db.Offers.AsNoTracking().Select(o => o.Document).ToListAsync(ct).ConfigureAwait(false))
            .Select(d => JsonSerializer.Deserialize<Offer>(d, Json.Options)!)
            .Where(o => CatalogRules.IsLive(o, today)).ToList();
        var templates = (await db.Templates.AsNoTracking().Select(t => t.Document).ToListAsync(ct).ConfigureAwait(false))
            .Select(d => JsonSerializer.Deserialize<ParserTemplate>(d, Json.Options)!).ToList();

        var checksum = CatalogCanonical.ContentChecksum(offers, templates);
        var latest = await db.Versions.AsNoTracking().OrderByDescending(v => v.Version).FirstOrDefaultAsync(ct).ConfigureAwait(false);
        if (latest is not null && latest.ContentChecksum.AsSpan().SequenceEqual(checksum))
            return (new PublishResult(latest.Version, Changed: false), new OutgoingMessages());

        var version = (latest?.Version ?? 0) + 1;
        var payload = CatalogCanonical.Serialize(new CatalogSnapshot(version, now, offers, templates));
        db.Versions.Add(new CatalogVersionRow
        {
            Version = version,
            CreatedAt = now,
            ContentChecksum = checksum,
            KeyId = signer.KeyId,
            Signature = signer.Sign(payload),
            Payload = payload,
        });
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return (new PublishResult(version, Changed: true),
            [new CatalogPublishedV1(version, Convert.ToHexString(checksum), now)]);
    }
}

public sealed class CatalogQueries(CatalogDbContext db)
{
    public async Task<SignedCatalog?> LatestAsync(CancellationToken ct)
    {
        var row = await db.Versions.AsNoTracking().OrderByDescending(v => v.Version).FirstOrDefaultAsync(ct).ConfigureAwait(false);
        return row is null ? null : new SignedCatalog(row.Version, row.KeyId, row.Signature, row.Payload);
    }
}
