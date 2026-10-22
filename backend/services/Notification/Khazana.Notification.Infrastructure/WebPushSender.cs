using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Khazana.Notification.Application;
using Khazana.Notification.Domain;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Notification.Infrastructure;

/// <summary>A browser's push subscription, stored as the device's token (JSON).</summary>
public sealed record WebPushSubscription(Uri Endpoint, byte[] P256dh, byte[] Auth)
{
    /// <summary>Parses <c>{"endpoint", "keys": {"p256dh", "auth"}}</c>, as <c>PushSubscription.toJSON()</c> gives it. Null if malformed.</summary>
    public static WebPushSubscription? Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!Uri.TryCreate(root.GetProperty("endpoint").GetString(), UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps)
                return null;
            var keys = root.GetProperty("keys");
            var p256dh = Base64UrlEncoder.DecodeBytes(keys.GetProperty("p256dh").GetString());
            var auth = Base64UrlEncoder.DecodeBytes(keys.GetProperty("auth").GetString());
            // An uncompressed P-256 point and a 16-byte secret, or it isn't a subscription.
            return p256dh is [0x04, ..] && p256dh.Length == 65 && auth.Length == 16 ? new WebPushSubscription(endpoint, p256dh, auth) : null;
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or FormatException or ArgumentException)
        {
            return null;
        }
    }
}

/// <summary>RFC 8291 message encryption (aes128gcm), so the push service sees only ciphertext.</summary>
public static class WebPushEncryption
{
    private const int RecordSize = 4096;

    /// <param name="senderKey">A fresh ECDH P-256 key per message (injectable for the RFC test vector).</param>
    /// <param name="salt">16 random bytes per message (injectable for the RFC test vector).</param>
    public static byte[] Encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, ECDiffieHellman senderKey, byte[] salt)
    {
        ArgumentNullException.ThrowIfNull(plaintext);
        ArgumentNullException.ThrowIfNull(uaPublic);
        ArgumentNullException.ThrowIfNull(senderKey);
        var asPublic = Uncompressed(senderKey.ExportParameters(false));
        using var ua = ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = uaPublic[1..33], Y = uaPublic[33..65] },
        });
        var ecdhSecret = senderKey.DeriveRawSecretAgreement(ua.PublicKey);

        byte[] keyInfo = [.. "WebPush: info"u8, 0x00, .. uaPublic, .. asPublic];
        var ikm = HKDF.DeriveKey(HashAlgorithmName.SHA256, ecdhSecret, 32, authSecret, keyInfo);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var cek = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, [.. "Content-Encoding: aes128gcm"u8, 0x00]);
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, [.. "Content-Encoding: nonce"u8, 0x00]);

        // One record: the payload and the 0x02 "last record" delimiter.
        byte[] padded = [.. plaintext, 0x02];
        var cipher = new byte[padded.Length];
        var tag = new byte[16];
        using (var gcm = new AesGcm(cek, 16)) gcm.Encrypt(nonce, padded, cipher, tag);

        var header = new byte[16 + 4 + 1 + asPublic.Length];
        salt.CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(16), RecordSize);
        header[20] = (byte)asPublic.Length;
        asPublic.CopyTo(header, 21);
        return [.. header, .. cipher, .. tag];
    }

    public static byte[] Uncompressed(ECParameters p) => [0x04, .. p.Q.X!, .. p.Q.Y!];
}

/// <summary>
/// Web Push to browsers (RFC 8030), with message encryption (RFC 8291) and
/// VAPID identification of the sender (RFC 8292). The push service (Mozilla,
/// Google, Apple) relays ciphertext it can't read.
/// </summary>
public sealed class WebPushSender(HttpClient http, WebPushOptions options, TimeProvider time) : IPushSender
{
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };

    public string Provider => PushProviders.WebPush;

    public async Task<PushOutcome> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        var subscription = WebPushSubscription.Parse(token);
        if (subscription is null) return PushOutcome.TokenInvalid;

        var payload = JsonSerializer.SerializeToUtf8Bytes(message.IsSilent
            ? new Dictionary<string, string?> { ["type"] = "sync" }
            : new Dictionary<string, string?> { ["type"] = "new-device", ["title"] = message.Title, ["body"] = message.Body });
        using var senderKey = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var body = WebPushEncryption.Encrypt(payload, subscription.P256dh, subscription.Auth, senderKey, RandomNumberGenerator.GetBytes(16));

        using var request = new HttpRequestMessage(HttpMethod.Post, subscription.Endpoint) { Content = new ByteArrayContent(body) };
        request.Content.Headers.ContentEncoding.Add("aes128gcm");
        request.Content.Headers.ContentType = new("application/octet-stream");
        request.Headers.Add("TTL", message.IsSilent ? "3600" : "86400");
        request.Headers.Add("Urgency", message.IsSilent ? "normal" : "high");
        request.Headers.Add("Topic", message.CollapseKey);
        request.Headers.TryAddWithoutValidation("Authorization", $"vapid t={Vapid(subscription.Endpoint)}, k={options.PublicKeyBase64Url}");

        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        if (response.IsSuccessStatusCode) return PushOutcome.Delivered;
        // 404/410: the browser dropped the subscription.
        return response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone ? PushOutcome.TokenInvalid : PushOutcome.Failed;
    }

    /// <summary>The VAPID JWT for one push service origin, valid 12 hours (RFC 8292 caps it at 24).</summary>
    private string Vapid(Uri endpoint)
    {
        var now = time.GetUtcNow();
        using var key = ECDsa.Create();
        key.ImportFromPem(options.PrivateKeyPem);
        return Handler.CreateToken(new SecurityTokenDescriptor
        {
            Audience = endpoint.GetLeftPart(UriPartial.Authority),
            Expires = now.AddHours(12).UtcDateTime,
            Claims = new Dictionary<string, object> { ["sub"] = options.Subject },
            SigningCredentials = new SigningCredentials(new ECDsaSecurityKey(ECDsa.Create(key.ExportParameters(true))), SecurityAlgorithms.EcdsaSha256),
        });
    }
}

public sealed class WebPushOptions
{
    /// <summary>The VAPID private key (EC P-256, PEM).</summary>
    public required string PrivateKeyPem { get; init; }

    /// <summary>A contact for the push services: <c>mailto:</c> or https.</summary>
    public required string Subject { get; init; }

    /// <summary>The application server key the browser subscribed with (uncompressed point, base64url).</summary>
    public string PublicKeyBase64Url
    {
        get
        {
            using var key = ECDsa.Create();
            key.ImportFromPem(PrivateKeyPem);
            var p = key.ExportParameters(false);
            return Base64UrlEncoder.Encode([0x04, .. p.Q.X!, .. p.Q.Y!]);
        }
    }
}
