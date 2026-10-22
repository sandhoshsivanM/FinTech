using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Khazana.MarketData.Domain;

/// <summary>
/// The whole day's NAVs as one compressed file. Every device downloads the
/// entire file, so the server never learns which funds anyone holds — the same
/// privacy rule the phone app already follows with AMFI directly.
/// </summary>
/// <param name="Date">The newest NAV date in the file (AMFI's publication day).</param>
/// <param name="Sha256">Hex SHA-256 of the uncompressed JSON. Doubles as the HTTP ETag.</param>
public sealed record NavDayFile(DateOnly Date, int RowCount, string Sha256, byte[] Gzip)
{
    /// <summary>
    /// Deterministic: rows sorted by scheme code, so the same NAVs always
    /// produce the same bytes and hash. Re-ingesting an unchanged day can then
    /// be detected by comparing hashes, and publish no event.
    /// O(n log n) for the sort.
    /// </summary>
    public static NavDayFile Build(IEnumerable<NavQuote> quotes)
    {
        ArgumentNullException.ThrowIfNull(quotes);
        var rows = quotes.OrderBy(q => q.SchemeCode, StringComparer.Ordinal).ToList();
        if (rows.Count == 0) throw new InvalidOperationException("A NAV file needs at least one row.");

        var date = rows.Max(q => q.Date);
        // Source-generated serializer: no runtime reflection, so it is faster
        // and still works in trimmed or ahead-of-time compiled builds.
        var json = JsonSerializer.SerializeToUtf8Bytes(
            rows.Select(q => new Row(q.SchemeCode, q.Isin, q.SchemeName, q.Nav, q.Date)).ToList(),
            NavDayFileJson.Default.ListRow);
        var sha = Convert.ToHexStringLower(SHA256.HashData(json));

        using var buffer = new MemoryStream();
        using (var gzip = new GZipStream(buffer, CompressionLevel.Optimal, leaveOpen: true))
        {
            gzip.Write(json);
        }
        return new NavDayFile(date, rows.Count, sha, buffer.ToArray());
    }

    // Short property names: ~15k rows a day, so every byte repeats 15k times.
    internal sealed record Row(
        [property: JsonPropertyName("c")] string Code,
        [property: JsonPropertyName("i")] string? Isin,
        [property: JsonPropertyName("n")] string Name,
        [property: JsonPropertyName("v")] decimal Nav,
        [property: JsonPropertyName("d")] DateOnly Date);
}

[JsonSourceGenerationOptions(DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(List<NavDayFile.Row>))]
internal sealed partial class NavDayFileJson : JsonSerializerContext;
