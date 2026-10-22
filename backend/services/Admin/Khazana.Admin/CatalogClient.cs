using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;

namespace Khazana.Admin;

/// <summary>A card offer as the Catalog service stores it. Public data, curated by ops.</summary>
public sealed record OfferDto(
    string Id, string? Issuer, string? Network, string? Product, string Merchant, string Category,
    string Benefit, decimal Value, decimal? Cap, DateOnly ValidFrom, DateOnly ValidTo, string Source, DateOnly VerifiedOn);

public sealed record PublishResultDto(long Version, bool Changed);

/// <summary>Why Catalog refused an edit, shown to the ops person.</summary>
public sealed class CatalogRefusedException(string reason) : Exception(reason)
{
    public CatalogRefusedException() : this("Refused.") { }
    public CatalogRefusedException(string reason, Exception inner) : this(reason) => _ = inner;
}

/// <summary>
/// The offer editors' door into Catalog's internal API, with its own service
/// key. Every call is first written to the audit log; no audit, no change.
/// </summary>
public sealed class CatalogClient(HttpClient http, ReportingClient audit)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public async Task<IReadOnlyList<OfferDto>> OffersAsync(ClaimsPrincipal admin, CancellationToken ct)
    {
        await audit.RecordAsync(admin, "admin.catalog.view", "page:offers", ct).ConfigureAwait(false);
        return (await http.GetFromJsonAsync<List<OfferDto>>("internal/catalog/offers", Json, ct).ConfigureAwait(false)) ?? [];
    }

    public async Task SaveAsync(ClaimsPrincipal admin, OfferDto offer, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(offer);
        await audit.RecordAsync(admin, "admin.catalog.save", $"offer:{offer.Id}", ct).ConfigureAwait(false);
        using var response = await http.PutAsJsonAsync($"internal/catalog/offers/{Uri.EscapeDataString(offer.Id)}", offer, Json, ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            throw new CatalogRefusedException(ReadError(body) ?? $"Catalog answered {(int)response.StatusCode}.");
        }
    }

    public async Task DeleteAsync(ClaimsPrincipal admin, string id, CancellationToken ct)
    {
        await audit.RecordAsync(admin, "admin.catalog.delete", $"offer:{id}", ct).ConfigureAwait(false);
        using var response = await http.DeleteAsync(new Uri($"internal/catalog/offers/{Uri.EscapeDataString(id)}", UriKind.Relative), ct).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
    }

    public async Task<PublishResultDto> PublishAsync(ClaimsPrincipal admin, CancellationToken ct)
    {
        await audit.RecordAsync(admin, "admin.catalog.publish", "catalog", ct).ConfigureAwait(false);
        using var response = await http.PostAsync(new Uri("internal/catalog/publish", UriKind.Relative), null, ct).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PublishResultDto>(Json, ct).ConfigureAwait(false))!;
    }

    private static string? ReadError(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("error", out var e) ? e.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
