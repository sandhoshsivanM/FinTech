using System.Security.Cryptography;
using Khazana.Identity.Application;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Identity.Infrastructure;

/// <summary>An ECDSA P-256 key used for ES256 access tokens.</summary>
public sealed class EcdsaSigningKeys : ISigningKeys, IDisposable
{
    private readonly ECDsa _key;

    private EcdsaSigningKeys(ECDsa key)
    {
        _key = key;
        var securityKey = new ECDsaSecurityKey(key);
        // The kid is the key's own thumbprint: stable for the key, and it
        // changes by itself when the key does.
        securityKey.KeyId = Base64UrlEncoder.Encode(JsonWebKeyConverter.ConvertFromECDsaSecurityKey(securityKey).ComputeJwkThumbprint());
        Current = new SigningCredentials(securityKey, SecurityAlgorithms.EcdsaSha256);

        var publicOnly = ECDsa.Create(key.ExportParameters(includePrivateParameters: false));
        ValidationKeys = [new ECDsaSecurityKey(publicOnly) { KeyId = securityKey.KeyId }];
    }

    public SigningCredentials Current { get; }

    public IReadOnlyList<SecurityKey> ValidationKeys { get; }

    /// <summary>
    /// A new key for each start. Development only: every restart signs every
    /// device out, which is fine on a laptop and unacceptable anywhere else.
    /// </summary>
    public static EcdsaSigningKeys Ephemeral() => new(ECDsa.Create(ECCurve.NamedCurves.nistP256));

    /// <summary>A PKCS#8 PEM private key, mounted from the secret store.</summary>
    public static EcdsaSigningKeys FromPemFile(string path)
    {
        var key = ECDsa.Create();
        key.ImportFromPem(File.ReadAllText(path));
        if (key.KeySize != 256)
        {
            key.Dispose();
            throw new InvalidOperationException("The token signing key must be an EC P-256 key.");
        }
        return new EcdsaSigningKeys(key);
    }

    public void Dispose() => _key.Dispose();
}
