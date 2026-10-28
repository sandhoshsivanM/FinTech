using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;
using Khazana.SharedKernel;

namespace Khazana.AccountAggregator.Infrastructure;

/// <summary>
/// The Setu Account Aggregator gateway (docs.setu.co/data/account-aggregator),
/// sandbox by default. Setu is the FIU-side gateway: it runs the ReBIT
/// consent artefact, the ECDH key exchange with the FIP and the decryption,
/// and hands back FI data as JSON over its authenticated API. This adapter
/// only ever holds that JSON in memory, normalises it into a
/// <see cref="FiBundle"/>, and the saga seals it to the user's delivery key.
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item>Consent: <c>POST /consents</c> → id (our handle) and the approval
///   <c>url</c> the app redirects to; <c>GET /consents/{id}</c> for status;
///   <c>POST /v2/consents/{id}/revoke</c>.</item>
/// <item>Data: <c>POST /sessions</c> (consentId, dataRange, format json) →
///   session id; <c>GET /sessions/{id}</c> once it is PARTIAL or COMPLETED.</item>
/// <item>Notifications (<c>CONSENT_STATUS_UPDATE</c>, <c>SESSION_STATUS_UPDATE</c>)
///   are not signed in Setu's docs, so they are treated as hints only: a
///   consent notification makes the service re-read the status over the
///   authenticated API, and a session notification only makes the saga
///   collect sooner. A forged callback can't change any state.</item>
/// <item>Errors: timeouts, 429 and 5xx are transient (the saga retries);
///   other refusals and unreadable data are not. Response bodies are never
///   logged or put in exception messages.</item>
/// </list>
/// </remarks>
public sealed class SetuBankDataProvider(SetuAaOptions options, IHttpClientFactory http, IClock clock) : IBankDataProvider, IDisposable
{
    public const string ProviderName = "setu";
    public const string HttpClientName = "setu-aa";
    public const string ProductInstanceHeader = "x-product-instance-id";

    /// <summary>A hint older than this is dropped; it would only trigger a re-read anyway.</summary>
    private static readonly TimeSpan CallbackWindow = TimeSpan.FromHours(1);

    /// <summary>EPF and PPF are not live on the AA network yet; Setu can't deliver them.</summary>
    private static readonly IReadOnlySet<string> Supported = new HashSet<string>(StringComparer.Ordinal)
    {
        FiTypes.Deposit, FiTypes.TermDeposit, FiTypes.RecurringDeposit, FiTypes.MutualFunds,
        FiTypes.Equities, FiTypes.Etf, FiTypes.Nps, FiTypes.Insurance,
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _token;
    private DateTimeOffset _tokenExpires;

    public string Name => ProviderName;

    public IReadOnlySet<string> SupportedFiTypes => Supported;

    public bool NeedsAaHandle => true;

    public async Task<ConsentCreated> CreateConsentAsync(ConsentRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrEmpty(request.AaHandle))
            throw new BankDataProviderException("aa_handle_required", transient: false, "Setu needs the user's mobile number or AA handle.");

        var days = Math.Max(1, (int)Math.Ceiling((request.ExpiresAt - clock.UtcNow).TotalDays));
        var body = new JsonObject
        {
            ["consentDuration"] = new JsonObject { ["unit"] = "DAY", ["value"] = days },
            ["vua"] = request.AaHandle,
            ["consentMode"] = "STORE",
            ["fetchType"] = "PERIODIC",
            ["consentTypes"] = new JsonArray("PROFILE", "SUMMARY", "TRANSACTIONS"),
            ["fiTypes"] = new JsonArray([.. request.FiTypes.Select(t => (JsonNode?)JsonValue.Create(t))]),
            ["purpose"] = options.Purpose,
            ["dataRange"] = new JsonObject
            {
                ["from"] = StartOf(request.DataFrom),
                ["to"] = EndOf(request.DataTo),
            },
            ["dataLife"] = new JsonObject { ["unit"] = "DAY", ["value"] = options.DataLifeDays },
            ["frequency"] = new JsonObject { ["unit"] = FrequencyUnit(request.Frequency), ["value"] = 1 },
        };
        if (!string.IsNullOrEmpty(options.RedirectUrl)) body["redirectUrl"] = options.RedirectUrl;

        using var doc = await SendAsync(HttpMethod.Post, "/consents", body, ct).ConfigureAwait(false);
        var root = doc.RootElement;
        var id = Str(root, "id");
        if (string.IsNullOrEmpty(id)) throw Unreadable();
        var url = Str(root, "url");
        Uri? redirect = null;
        if (url is not null && (!Uri.TryCreate(url, UriKind.Absolute, out redirect) || redirect.Scheme != Uri.UriSchemeHttps))
            throw Unreadable();
        return new ConsentCreated(id, redirect);
    }

    public async Task<ConsentStatus> GetConsentStatusAsync(string consentHandle, CancellationToken ct)
    {
        using var doc = await SendAsync(HttpMethod.Get, $"/consents/{Escape(consentHandle)}", null, ct).ConfigureAwait(false);
        return MapConsentStatus(Str(doc.RootElement, "status")) ?? throw Unreadable();
    }

    public async Task RevokeConsentAsync(string consentHandle, CancellationToken ct)
    {
        try
        {
            using var _ = await SendAsync(HttpMethod.Post, $"/v2/consents/{Escape(consentHandle)}/revoke", null, ct).ConfigureAwait(false);
        }
        catch (BankDataProviderException e) when (e.Code is "provider_not_found" or "provider_conflict")
        {
            // Already ended or unknown at Setu: revoking is idempotent.
        }
    }

    public async Task<FiRequestStarted> RequestFiDataAsync(string consentHandle, DateOnly dataFrom, DateOnly dataTo, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["consentId"] = consentHandle,
            ["dataRange"] = new JsonObject { ["from"] = StartOf(dataFrom), ["to"] = EndOf(dataTo) },
            ["format"] = "json",
        };
        using var doc = await SendAsync(HttpMethod.Post, "/sessions", body, ct).ConfigureAwait(false);
        var id = Str(doc.RootElement, "id");
        if (string.IsNullOrEmpty(id)) throw Unreadable();
        // Setu notifies when the FIPs have answered; until then the saga polls.
        return new FiRequestStarted(id, DataReady: false);
    }

    public async Task<FiFetchResult> FetchFiDataAsync(FiFetchContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        using var doc = await SendAsync(HttpMethod.Get, $"/sessions/{Escape(context.SessionId)}", null, ct).ConfigureAwait(false);
        switch (Str(doc.RootElement, "status")?.ToUpperInvariant())
        {
            case "PENDING":
                return FiFetchResult.NotReady;
            case "PARTIAL" or "COMPLETED":
                var bundle = SetuFiMapper.Map(doc.RootElement, context);
                return new FiFetchResult(bundle, bundle.AccountCount);
            case "EXPIRED":
                throw new BankDataProviderException("session_expired", transient: false, "The Setu data session expired.");
            case "FAILED":
                throw new BankDataProviderException("session_failed", transient: false, "The Setu data session failed.");
            default:
                throw Unreadable();
        }
    }

    public AaCallback? VerifyCallback(byte[] body, Func<string, string?> header, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(body);
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            var consentId = Str(root, "consentId");
            if (string.IsNullOrEmpty(consentId) || consentId.Length > 128) return null;
            if (!DateTimeOffset.TryParse(Str(root, "timestamp"), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at) ||
                (now - at).Duration() > CallbackWindow) return null;
            switch (Str(root, "type"))
            {
                case "CONSENT_STATUS_UPDATE":
                    // Status left null on purpose: the service asks Setu itself.
                    return new AaCallback(AaCallbackKind.ConsentStatus, consentId, null, null);
                case "SESSION_STATUS_UPDATE":
                    var session = Str(root, "dataSessionId");
                    return string.IsNullOrEmpty(session) || session.Length > 128
                        ? null
                        : new AaCallback(AaCallbackKind.DataReady, consentId, null, session);
                default:
                    return null;
            }
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public void Dispose() => _tokenLock.Dispose();

    internal static ConsentStatus? MapConsentStatus(string? status) => status?.ToUpperInvariant() switch
    {
        "PENDING" or "INITIATED" => ConsentStatus.Pending,
        "ACTIVE" or "APPROVED" => ConsentStatus.Active,
        "PAUSED" => ConsentStatus.Paused,
        "REVOKED" => ConsentStatus.Revoked,
        "EXPIRED" => ConsentStatus.Expired,
        "REJECTED" or "FAILED" => ConsentStatus.Rejected,
        _ => null,
    };

    private static string FrequencyUnit(FetchFrequency frequency) => frequency switch
    {
        FetchFrequency.Daily => "DAILY",
        FetchFrequency.Monthly => "MONTHLY",
        // Setu's units are HOURLY, DAILY, MONTHLY, YEARLY: weekly is asked as daily, and the saga schedules weekly.
        _ => "DAILY",
    };

    private static string StartOf(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "T00:00:00.000Z";

    private static string EndOf(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "T23:59:59.999Z";

    private static string Escape(string segment) => Uri.EscapeDataString(segment);

    private static BankDataProviderException Unreadable() =>
        new("provider_unreadable", transient: false, "Setu answered with something this adapter can't read.");

    internal static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, JsonNode? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, new Uri(path.TrimStart('/'), UriKind.Relative));
        if (body is not null) request.Content = JsonContent.Create(body, options: Json);
        await AuthenticateAsync(request, ct).ConfigureAwait(false);
        var client = http.CreateClient(HttpClientName);
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct).ConfigureAwait(false);
        }
        catch (HttpRequestException)
        {
            throw new BankDataProviderException("provider_unavailable", transient: true, "Setu could not be reached.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new BankDataProviderException("provider_timeout", transient: true, "Setu did not answer in time.");
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.Unauthorized) _token = null;
            if (!response.IsSuccessStatusCode) throw Refused(response.StatusCode);
            try
            {
                var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
                return await JsonDocument.ParseAsync(stream, cancellationToken: ct).ConfigureAwait(false);
            }
            catch (JsonException)
            {
                throw Unreadable();
            }
        }
    }

    private static BankDataProviderException Refused(HttpStatusCode status) => (int)status switch
    {
        401 or 403 => new("provider_unauthorized", transient: true, $"Setu refused the credentials ({(int)status})."),
        404 => new("provider_not_found", transient: false, "Setu does not know this consent or session."),
        409 => new("provider_conflict", transient: false, "Setu says this conflicts with the consent's state."),
        408 or 429 => new("provider_busy", transient: true, $"Setu is busy ({(int)status})."),
        >= 500 => new("provider_unavailable", transient: true, $"Setu failed ({(int)status})."),
        _ => new("provider_refused", transient: false, $"Setu refused the request ({(int)status})."),
    };

    private async Task AuthenticateAsync(HttpRequestMessage request, CancellationToken ct)
    {
        request.Headers.Add(ProductInstanceHeader, options.ProductInstanceId);
        if (string.Equals(options.Auth, "Headers", StringComparison.OrdinalIgnoreCase))
        {
            request.Headers.Add("x-client-id", options.ClientId);
            request.Headers.Add("x-client-secret", options.ClientSecret);
            return;
        }
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenAsync(ct).ConfigureAwait(false));
    }

    /// <summary>A bearer token from Setu's login endpoint, reused until a minute before it expires.</summary>
    private async Task<string> TokenAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        if (_token is { } cached && now < _tokenExpires) return cached;
        await _tokenLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_token is { } again && now < _tokenExpires) return again;
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(options.TokenUrl))
            {
                Content = JsonContent.Create(new JsonObject
                {
                    ["clientID"] = options.ClientId,
                    ["grant_type"] = "client_credentials",
                    ["secret"] = options.ClientSecret,
                }, options: Json),
            };
            request.Headers.Add("client", "bridge");
            HttpResponseMessage response;
            try
            {
                response = await http.CreateClient(HttpClientName).SendAsync(request, ct).ConfigureAwait(false);
            }
            catch (HttpRequestException)
            {
                throw new BankDataProviderException("provider_unavailable", transient: true, "Setu's token endpoint could not be reached.");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                throw new BankDataProviderException("provider_timeout", transient: true, "Setu's token endpoint did not answer in time.");
            }
            using (response)
            {
                if (!response.IsSuccessStatusCode) throw Refused(response.StatusCode);
                using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false), cancellationToken: ct).ConfigureAwait(false);
                var root = doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object ? data : doc.RootElement;
                var token = Str(root, "access_token") ?? Str(root, "accessToken") ?? Str(root, "token");
                if (string.IsNullOrEmpty(token)) throw Unreadable();
                var lifetime = root.TryGetProperty("expiresIn", out var e) && e.TryGetInt32(out var s) ? s
                    : root.TryGetProperty("expires_in", out var e2) && e2.TryGetInt32(out var s2) ? s2 : 300;
                _token = token;
                _tokenExpires = now.AddSeconds(Math.Max(30, lifetime - 60));
                return token;
            }
        }
        catch (JsonException)
        {
            throw Unreadable();
        }
        finally
        {
            _tokenLock.Release();
        }
    }
}
