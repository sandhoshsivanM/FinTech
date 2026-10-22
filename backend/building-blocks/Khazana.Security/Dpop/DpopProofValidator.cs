using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Security.Dpop;

/// <summary>A DPoP proof that passed every check.</summary>
/// <param name="Jkt">RFC 7638 thumbprint of the device's public key: what a token is bound to.</param>
public sealed record DpopProof(string Jkt, string Jti, DateTimeOffset IssuedAt);

/// <summary>A proof that must be refused. The message is safe to log, never to show.</summary>
public sealed class DpopValidationException(string message) : Exception(message)
{
    public DpopValidationException() : this("Invalid DPoP proof.") { }
    public DpopValidationException(string message, Exception inner) : this(message) => _ = inner;
}

/// <summary>
/// Checks a DPoP proof (RFC 9449): a short JWT the app signs with its device
/// key for every request. A token bound to that key is useless to anyone who
/// steals it, because they cannot sign the next proof.
/// </summary>
/// <remarks>
/// Deliberately strict, because the client is ours: ES256 only, P-256 only,
/// a public key only, one use per proof, a two-minute window either side for
/// phone clocks, and the exact method and URL of this request.
/// </remarks>
public sealed class DpopProofValidator(IDpopReplayCache replay, TimeProvider time)
{
    /// <summary>How far a proof's <c>iat</c> may sit from the server clock, either way.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(2);

    /// <summary>A real proof is ~600 characters.</summary>
    public const int MaxLength = 4096;

    private static readonly JsonWebTokenHandler Handler = new();

    /// <param name="proof">The <c>DPoP</c> header value.</param>
    /// <param name="method">This request's HTTP method.</param>
    /// <param name="acceptedUris">This request's URL as clients may see it (one per public origin).</param>
    /// <param name="accessToken">The access token sent with it, which the proof must name (<c>ath</c>); null at the token endpoint.</param>
    public async Task<DpopProof> ValidateAsync(
        string? proof, string method, IReadOnlyCollection<Uri> acceptedUris, string? accessToken = null)
    {
        ArgumentNullException.ThrowIfNull(method);
        ArgumentNullException.ThrowIfNull(acceptedUris);
        if (string.IsNullOrWhiteSpace(proof)) throw new DpopValidationException("DPoP proof missing.");
        if (proof.Length > MaxLength) throw new DpopValidationException("DPoP proof too long.");

        var key = ReadPublicKey(proof);

        var result = await Handler.ValidateTokenAsync(proof, new TokenValidationParameters
        {
            // The key from the proof's header is the only one ever tried,
            // whatever kid the header names.
            IssuerSigningKeyResolver = (_, _, _, _) => [key],
            ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
            ValidTypes = ["dpop+jwt"],
            RequireSignedTokens = true,
            ValidateIssuer = false,
            ValidateAudience = false,
            // iat is checked below with our own window; a proof has no exp.
            ValidateLifetime = false,
            RequireExpirationTime = false,
        }).ConfigureAwait(false);
        if (!result.IsValid) throw new DpopValidationException("DPoP proof signature invalid.");
        var jwt = (JsonWebToken)result.SecurityToken;

        var jti = Claim(jwt, "jti");
        if (jti.Length is 0 or > 128) throw new DpopValidationException("DPoP jti invalid.");

        if (!string.Equals(Claim(jwt, "htm"), method, StringComparison.Ordinal))
            throw new DpopValidationException("DPoP htm does not match the request.");

        if (!Uri.TryCreate(Claim(jwt, "htu"), UriKind.Absolute, out var htu) ||
            !acceptedUris.Any(u => SameTarget(u, htu)))
            throw new DpopValidationException("DPoP htu does not match the request.");

        // Bounded before conversion: FromUnixTimeSeconds throws on absurd values,
        // which an attacker can put in a proof signed with their own key.
        if (!jwt.TryGetPayloadValue<long>("iat", out var iatSeconds) || iatSeconds is < 0 or > 10_000_000_000)
            throw new DpopValidationException("DPoP iat missing or out of range.");
        var iat = DateTimeOffset.FromUnixTimeSeconds(iatSeconds);
        var now = time.GetUtcNow();
        if (iat < now - Window || iat > now + Window)
            throw new DpopValidationException("DPoP proof is too old or from the future.");

        if (accessToken is not null)
        {
            var expected = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(accessToken)));
            if (!jwt.TryGetPayloadValue<string>("ath", out var ath) ||
                !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(ath), Encoding.ASCII.GetBytes(expected)))
                throw new DpopValidationException("DPoP ath does not match the access token.");
        }

        var jkt = Base64UrlEncoder.Encode(key.ComputeJwkThumbprint());

        // One use per proof. Kept past the window so a replay can't outlive it.
        if (!await replay.TryRememberAsync($"{jkt}:{jti}", iat + Window + Window).ConfigureAwait(false))
            throw new DpopValidationException("DPoP proof already used.");

        return new DpopProof(jkt, jti, iat);
    }

    /// <summary>
    /// The key comes from the proof's own header, so it is checked before it
    /// is trusted for anything: an EC P-256 public key and nothing else.
    /// </summary>
    private static JsonWebKey ReadPublicKey(string proof)
    {
        var dot = proof.IndexOf('.', StringComparison.Ordinal);
        if (dot <= 0) throw new DpopValidationException("DPoP proof is not a JWT.");
        try
        {
            using var header = JsonDocument.Parse(Base64UrlEncoder.Decode(proof[..dot]));
            if (!header.RootElement.TryGetProperty("jwk", out var jwk) || jwk.ValueKind != JsonValueKind.Object)
                throw new DpopValidationException("DPoP header has no jwk.");
            var key = new JsonWebKey(jwk.GetRawText());
            if (key.Kty != JsonWebAlgorithmsKeyTypes.EllipticCurve || key.Crv != JsonWebKeyECTypes.P256 ||
                string.IsNullOrEmpty(key.X) || string.IsNullOrEmpty(key.Y))
                throw new DpopValidationException("DPoP key must be an EC P-256 public key.");
            // A private part here means the client leaked its key: never accept it.
            if (!string.IsNullOrEmpty(key.D)) throw new DpopValidationException("DPoP key contains a private part.");
            return key;
        }
        catch (Exception e) when (e is JsonException or FormatException or ArgumentException)
        {
            throw new DpopValidationException("DPoP header unreadable.", e);
        }
    }

    private static string Claim(JsonWebToken jwt, string name) =>
        jwt.TryGetPayloadValue<string>(name, out var value) ? value : string.Empty;

    /// <summary>Scheme, host, port and path; query and fragment are ignored (RFC 9449 §4.3).</summary>
    private static bool SameTarget(Uri expected, Uri actual) =>
        string.Equals(expected.Scheme, actual.Scheme, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(expected.Host, actual.Host, StringComparison.OrdinalIgnoreCase) &&
        expected.Port == actual.Port &&
        string.Equals(expected.AbsolutePath, actual.AbsolutePath, StringComparison.Ordinal);
}
