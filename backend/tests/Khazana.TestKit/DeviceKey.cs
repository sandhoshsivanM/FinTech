using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.TestKit;

/// <summary>
/// A phone's device key, as the app holds it in the secure chip: an EC P-256
/// key that signs a DPoP proof for every request.
/// </summary>
public sealed class DeviceKey : IDisposable
{
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);

    public DeviceKey() => Jkt = Base64UrlEncoder.Encode(PublicJwk().ComputeJwkThumbprint());

    /// <summary>The RFC 7638 thumbprint tokens get bound to.</summary>
    public string Jkt { get; }

    /// <summary>A proof for one request. The optional knobs build the attacks the tests try.</summary>
    public string Proof(
        string method,
        string url,
        string? accessToken = null,
        DateTimeOffset? issuedAt = null,
        string? jti = null,
        string alg = SecurityAlgorithms.EcdsaSha256,
        string type = "dpop+jwt",
        bool leakPrivateKey = false,
        long? rawIat = null)
    {
        var jwk = new Dictionary<string, object>
        {
            ["kty"] = "EC", ["crv"] = "P-256",
            ["x"] = PublicJwk().X, ["y"] = PublicJwk().Y,
        };
        if (leakPrivateKey) jwk["d"] = Base64UrlEncoder.Encode(_key.ExportParameters(true).D);

        var claims = new Dictionary<string, object>
        {
            ["jti"] = jti ?? Guid.NewGuid().ToString("N"),
            ["htm"] = method,
            ["htu"] = url,
            ["iat"] = rawIat ?? (issuedAt ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds(),
        };
        if (accessToken is not null)
            claims["ath"] = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(accessToken)));

        var signing = alg == SecurityAlgorithms.EcdsaSha256
            ? new SigningCredentials(new ECDsaSecurityKey(_key), alg)
            : new SigningCredentials(new SymmetricSecurityKey(RandomNumberGenerator.GetBytes(32)), alg);
        return Handler.CreateToken(new SecurityTokenDescriptor
        {
            TokenType = type,
            AdditionalHeaderClaims = new Dictionary<string, object> { ["jwk"] = jwk },
            Claims = claims,
            SigningCredentials = signing,
        });
    }

    private JsonWebKey PublicJwk()
    {
        var p = _key.ExportParameters(false);
        return new JsonWebKey
        {
            Kty = "EC", Crv = "P-256",
            X = Base64UrlEncoder.Encode(p.Q.X), Y = Base64UrlEncoder.Encode(p.Q.Y),
        };
    }

    public void Dispose() => _key.Dispose();
}
