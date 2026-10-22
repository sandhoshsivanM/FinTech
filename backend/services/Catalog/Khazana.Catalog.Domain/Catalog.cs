using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Khazana.Catalog.Domain;

/// <summary>
/// A card offer, curated by hand from a bank's or network's public page
/// (design doc §8.7). "Use the cards you have better": savings on cards the
/// user already holds, never a referral to a new card (D8). Matching against
/// the user's cards and spending happens on the device; the server never sees
/// either.
/// </summary>
public sealed record Offer(
    string Id, string? Issuer, string? Network, string? Product, string Merchant, string Category,
    string Benefit, decimal Value, decimal? Cap, DateOnly ValidFrom, DateOnly ValidTo, string Source, DateOnly VerifiedOn);

/// <summary>A server-updatable rule for reading one bank's alerts on the device.</summary>
public sealed record ParserTemplate(string Id, string Bank, string Channel, IReadOnlyList<string> SenderPatterns, string RuleJson, int Version);

/// <summary>What the app downloads: every live offer and template, at one version.</summary>
public sealed record CatalogSnapshot(long Version, DateTimeOffset GeneratedAt, IReadOnlyList<Offer> Offers, IReadOnlyList<ParserTemplate> Templates);

public static partial class CatalogRules
{
    public static readonly IReadOnlySet<string> Benefits =
        new HashSet<string>(StringComparer.Ordinal) { "cashback", "discount", "points", "lounge", "fuel_waiver", "emi" };

    public static readonly IReadOnlySet<string> Channels =
        new HashSet<string>(StringComparer.Ordinal) { "sms", "notification", "email" };

    public static readonly IReadOnlySet<string> Networks =
        new HashSet<string>(StringComparer.Ordinal) { "visa", "mastercard", "rupay", "amex", "diners" };

    public const int MaxRuleJsonBytes = 16 * 1024;

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]{0,63}$")]
    private static partial Regex IdPattern();

    /// <summary>Why an offer is refused, or null.</summary>
    public static string? Validate(Offer o)
    {
        ArgumentNullException.ThrowIfNull(o);
        if (!IdPattern().IsMatch(o.Id ?? string.Empty)) return "Bad id.";
        if (string.IsNullOrWhiteSpace(o.Merchant) || o.Merchant.Length > 80 || o.Merchant.Any(char.IsControl)) return "Bad merchant.";
        if (string.IsNullOrWhiteSpace(o.Category) || o.Category.Length > 40) return "Bad category.";
        if (!Benefits.Contains(o.Benefit)) return "Unknown benefit.";
        if (o.Network is not null && !Networks.Contains(o.Network)) return "Unknown network.";
        if (o.Issuer is null && o.Network is null && o.Product is null) return "An offer must name an issuer, a network or a product.";
        if (o.Value < 0 || o.Value > 100_000) return "Value out of range.";
        if (o.Cap is < 0) return "Negative cap.";
        if (o.ValidTo < o.ValidFrom) return "Ends before it starts.";
        // A source the user can check: https only, so a curated offer can't
        // point the app at a plain-HTTP or javascript: link.
        if (!Uri.TryCreate(o.Source, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return "Source must be an https link.";
        return null;
    }

    public static string? Validate(ParserTemplate t)
    {
        ArgumentNullException.ThrowIfNull(t);
        if (!IdPattern().IsMatch(t.Id ?? string.Empty)) return "Bad id.";
        if (string.IsNullOrWhiteSpace(t.Bank) || t.Bank.Length > 40) return "Bad bank.";
        if (!Channels.Contains(t.Channel)) return "Unknown channel.";
        if (t.SenderPatterns is null || t.SenderPatterns.Count is 0 or > 50 || t.SenderPatterns.Any(p => p is null || p.Length is 0 or > 64))
            return "Bad sender patterns.";
        if (t.Version < 1) return "Bad version.";
        if (System.Text.Encoding.UTF8.GetByteCount(t.RuleJson ?? string.Empty) > MaxRuleJsonBytes) return "Rule too large.";
        try
        {
            using var _ = JsonDocument.Parse(t.RuleJson ?? string.Empty);
        }
        catch (JsonException)
        {
            return "Rule is not JSON.";
        }
        return null;
    }

    public static bool IsLive(Offer o, DateOnly today) => o is not null && o.ValidFrom <= today && today <= o.ValidTo;
}

/// <summary>
/// The exact bytes that get signed: snake_case JSON, entries sorted by id, so
/// the same catalog always produces the same bytes and the same checksum.
/// </summary>
public static class CatalogCanonical
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = false,
    };

    public static byte[] Serialize(CatalogSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        var ordered = snapshot with
        {
            Offers = [.. snapshot.Offers.OrderBy(o => o.Id, StringComparer.Ordinal)],
            Templates = [.. snapshot.Templates.OrderBy(t => t.Id, StringComparer.Ordinal)],
        };
        return JsonSerializer.SerializeToUtf8Bytes(ordered, Options);
    }

    /// <summary>
    /// A checksum of the content alone (version and time left out), to tell
    /// whether anything actually changed since the last version.
    /// </summary>
    public static byte[] ContentChecksum(IReadOnlyList<Offer> offers, IReadOnlyList<ParserTemplate> templates) =>
        SHA256.HashData(Serialize(new CatalogSnapshot(0, DateTimeOffset.UnixEpoch, offers, templates)));
}
