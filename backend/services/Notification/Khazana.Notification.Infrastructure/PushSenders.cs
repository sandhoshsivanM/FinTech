using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Khazana.Notification.Application;
using Khazana.Notification.Domain;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Notification.Infrastructure;

/// <summary>
/// Development stand-in for every provider (decision D15): records what would
/// have been sent, sends nothing. Tokens starting with <c>dead-</c> answer
/// "invalid", so the cleanup path can be exercised without a real provider.
/// Refused in Production at startup.
/// </summary>
public sealed class LogPushSender(string provider, PushLog log) : IPushSender
{
    public string Provider => provider;

    public Task<PushOutcome> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(token);
        if (token.StartsWith("dead-", StringComparison.Ordinal)) return Task.FromResult(PushOutcome.TokenInvalid);
        log.Record(provider, token, message);
        return Task.FromResult(PushOutcome.Delivered);
    }
}

/// <summary>What the log sender "sent", for tests and the developer.</summary>
public sealed class PushLog
{
    private readonly ConcurrentQueue<(string Provider, string Token, PushMessage Message)> _sent = new();

    public void Record(string provider, string token, PushMessage message) => _sent.Enqueue((provider, token, message));

    public IReadOnlyList<(string Provider, string Token, PushMessage Message)> Sent => [.. _sent];
}

/// <summary>Firebase Cloud Messaging, HTTP v1 API (free). Android, and web through FCM.</summary>
/// <remarks>
/// Authenticates with a Google service account: a JWT signed with its private
/// key is exchanged for a one-hour OAuth token, cached until five minutes
/// before it expires. The service-account file comes from the secret store.
/// </remarks>
public sealed class FcmPushSender(HttpClient http, FcmOptions options, TimeProvider time) : IPushSender, IDisposable
{
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _accessToken;
    private DateTimeOffset _accessTokenExpires;

    public string Provider => PushProviders.Fcm;

    public async Task<PushOutcome> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        var body = new JsonObject
        {
            ["message"] = new JsonObject
            {
                ["token"] = token,
                ["data"] = new JsonObject { ["type"] = message.Kind == PushKind.Sync ? "sync" : "new-device" },
                ["android"] = new JsonObject
                {
                    ["priority"] = message.IsSilent ? "NORMAL" : "HIGH",
                    ["collapse_key"] = message.CollapseKey,
                },
            },
        };
        if (!message.IsSilent)
            body["message"]!["notification"] = new JsonObject { ["title"] = message.Title, ["body"] = message.Body };

        using var request = new HttpRequestMessage(HttpMethod.Post,
            new Uri($"https://fcm.googleapis.com/v1/projects/{options.ProjectId}/messages:send"))
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Authorization = new("Bearer", await AccessTokenAsync(ct).ConfigureAwait(false));
        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        if (response.IsSuccessStatusCode) return PushOutcome.Delivered;

        // 404 with UNREGISTERED: the app was uninstalled or the token rotated.
        // 400 INVALID_ARGUMENT on the token field: it was never valid.
        var error = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        return response.StatusCode == HttpStatusCode.NotFound || error.Contains("UNREGISTERED", StringComparison.Ordinal)
            ? PushOutcome.TokenInvalid
            : PushOutcome.Failed;
    }

    public void Dispose() => _tokenLock.Dispose();

    private async Task<string> AccessTokenAsync(CancellationToken ct)
    {
        await _tokenLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var now = time.GetUtcNow();
            if (_accessToken is not null && now < _accessTokenExpires - TimeSpan.FromMinutes(5)) return _accessToken;

            using var rsa = RSA.Create();
            rsa.ImportFromPem(options.PrivateKeyPem);
            var assertion = Handler.CreateToken(new SecurityTokenDescriptor
            {
                Issuer = options.ClientEmail,
                Audience = options.TokenUri,
                IssuedAt = now.UtcDateTime,
                Expires = now.AddHours(1).UtcDateTime,
                Claims = new Dictionary<string, object> { ["scope"] = "https://www.googleapis.com/auth/firebase.messaging" },
                SigningCredentials = new SigningCredentials(new RsaSecurityKey(rsa.ExportParameters(true)), SecurityAlgorithms.RsaSha256),
            });
            using var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                ["assertion"] = assertion,
            });
            using var response = await http.PostAsync(new Uri(options.TokenUri), form, ct).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false), cancellationToken: ct).ConfigureAwait(false);
            _accessToken = json.RootElement.GetProperty("access_token").GetString();
            _accessTokenExpires = now.AddSeconds(json.RootElement.GetProperty("expires_in").GetInt32());
            return _accessToken!;
        }
        finally
        {
            _tokenLock.Release();
        }
    }
}

public sealed class FcmOptions
{
    public required string ProjectId { get; init; }
    public required string ClientEmail { get; init; }
    public required string PrivateKeyPem { get; init; }
    public string TokenUri { get; init; } = "https://oauth2.googleapis.com/token";

    /// <summary>Reads the service-account JSON Google provides.</summary>
    public static FcmOptions FromServiceAccountJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        return new FcmOptions
        {
            ProjectId = root.GetProperty("project_id").GetString()!,
            ClientEmail = root.GetProperty("client_email").GetString()!,
            PrivateKeyPem = root.GetProperty("private_key").GetString()!,
            TokenUri = root.TryGetProperty("token_uri", out var uri) ? uri.GetString()! : "https://oauth2.googleapis.com/token",
        };
    }
}

/// <summary>Apple Push Notification service, token-based authentication over HTTP/2. iOS.</summary>
/// <remarks>
/// Signs a provider JWT (ES256, the .p8 key from the Apple developer account)
/// and reuses it for 50 minutes; Apple rejects tokens older than an hour and
/// throttles ones refreshed too often.
/// </remarks>
public sealed class ApnsPushSender(HttpClient http, ApnsOptions options, TimeProvider time) : IPushSender
{
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };
    private readonly Lock _gate = new();
    private string? _jwt;
    private DateTimeOffset _jwtIssued;

    public string Provider => PushProviders.Apns;

    public async Task<PushOutcome> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(token);
        ArgumentNullException.ThrowIfNull(message);
        // An APNs device token is hex; anything else would be pasted into the URL path.
        if (token.Length is 0 or > 200 || !token.All(Uri.IsHexDigit)) return PushOutcome.TokenInvalid;

        var payload = message.IsSilent
            ? new JsonObject { ["aps"] = new JsonObject { ["content-available"] = 1 }, ["type"] = "sync" }
            : new JsonObject
            {
                ["aps"] = new JsonObject
                {
                    ["alert"] = new JsonObject { ["title"] = message.Title, ["body"] = message.Body },
                    ["sound"] = "default",
                },
                ["type"] = "new-device",
            };

        var host = options.UseSandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri($"https://{host}/3/device/{token}"))
        {
            Version = HttpVersion.Version20,
            VersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Content = JsonContent.Create(payload),
        };
        request.Headers.Authorization = new("bearer", ProviderToken());
        request.Headers.Add("apns-topic", options.BundleId);
        request.Headers.Add("apns-push-type", message.IsSilent ? "background" : "alert");
        // Apple requires priority 5 for background pushes.
        request.Headers.Add("apns-priority", message.IsSilent ? "5" : "10");
        request.Headers.Add("apns-collapse-id", message.CollapseKey);

        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        if (response.IsSuccessStatusCode) return PushOutcome.Delivered;
        var reason = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        return response.StatusCode == HttpStatusCode.Gone ||
               reason.Contains("BadDeviceToken", StringComparison.Ordinal) ||
               reason.Contains("Unregistered", StringComparison.Ordinal)
            ? PushOutcome.TokenInvalid
            : PushOutcome.Failed;
    }

    private string ProviderToken()
    {
        lock (_gate)
        {
            var now = time.GetUtcNow();
            if (_jwt is not null && now - _jwtIssued < TimeSpan.FromMinutes(50)) return _jwt;
            using var key = ECDsa.Create();
            key.ImportFromPem(options.PrivateKeyPem);
            _jwt = Handler.CreateToken(new SecurityTokenDescriptor
            {
                Issuer = options.TeamId,
                IssuedAt = now.UtcDateTime,
                SigningCredentials = new SigningCredentials(
                    new ECDsaSecurityKey(ECDsa.Create(key.ExportParameters(true))) { KeyId = options.KeyId }, SecurityAlgorithms.EcdsaSha256),
            });
            _jwtIssued = now;
            return _jwt;
        }
    }
}

public sealed class ApnsOptions
{
    public required string TeamId { get; init; }
    public required string KeyId { get; init; }
    public required string BundleId { get; init; }
    public required string PrivateKeyPem { get; init; }
    public bool UseSandbox { get; init; }
}
