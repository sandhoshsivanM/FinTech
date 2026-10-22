using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.TestKit;

/// <summary>
/// Stands in for Identity in other services' tests: mints access tokens exactly
/// as Identity does (ES256, at+jwt, cnf.jkt), with a key the service under test
/// is told to trust. Tests of Identity itself use the real issuer.
/// </summary>
public sealed class TestTokenIssuer : IDisposable
{
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly ECDsaSecurityKey _securityKey;

    public TestTokenIssuer() => _securityKey = new ECDsaSecurityKey(_key) { KeyId = "test-identity" };

    /// <summary>Register in place of the service's Identity key fetcher.</summary>
    public IConfigurationManager<OpenIdConnectConfiguration> Keys
    {
        get
        {
            var config = new OpenIdConnectConfiguration();
            config.SigningKeys.Add(_securityKey);
            return new StaticConfigurationManager<OpenIdConnectConfiguration>(config);
        }
    }

    public string Mint(Guid userId, Guid deviceId, DeviceKey device, TimeSpan? lifetime = null, string audience = "khazana-api")
    {
        ArgumentNullException.ThrowIfNull(device);
        var now = DateTime.UtcNow;
        return Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "khazana-identity",
            Audience = audience,
            IssuedAt = now,
            NotBefore = now.AddMinutes(-1),
            Expires = now + (lifetime ?? TimeSpan.FromMinutes(15)),
            TokenType = "at+jwt",
            SigningCredentials = new SigningCredentials(_securityKey, SecurityAlgorithms.EcdsaSha256),
            Claims = new Dictionary<string, object>
            {
                ["sub"] = userId.ToString(),
                ["did"] = deviceId.ToString(),
                ["jti"] = Guid.NewGuid().ToString("N"),
                ["cnf"] = new Dictionary<string, object> { ["jkt"] = device.Jkt },
            },
        });
    }

    public void Dispose() => _key.Dispose();
}
