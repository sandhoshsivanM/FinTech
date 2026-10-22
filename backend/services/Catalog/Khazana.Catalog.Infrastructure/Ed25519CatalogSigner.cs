using System.Security.Cryptography;
using Khazana.Catalog.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSec.Cryptography;

namespace Khazana.Catalog.Infrastructure;

/// <summary>Ed25519 through libsodium (NSec). Apps pin the public key(s) and refuse anything else.</summary>
public sealed class Ed25519CatalogSigner : ICatalogSigner, IDisposable
{
    private readonly Key _key;

    /// <param name="seed">The 32-byte private seed, from the secret store.</param>
    public Ed25519CatalogSigner(ReadOnlySpan<byte> seed)
    {
        if (seed.Length != 32) throw new InvalidOperationException("The catalog signing seed must be 32 bytes.");
        _key = Key.Import(SignatureAlgorithm.Ed25519, seed, KeyBlobFormat.RawPrivateKey);
        PublicKey = _key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
        KeyId = Convert.ToHexString(SHA256.HashData(PublicKey))[..16].ToLowerInvariant();
    }

    public string KeyId { get; }

    public byte[] PublicKey { get; }

    public byte[] Sign(byte[] payload) => SignatureAlgorithm.Ed25519.Sign(_key, payload);

    public void Dispose() => _key.Dispose();
}

public static class DependencyInjection
{
    /// <summary>
    /// <c>Catalog:SigningSeed</c> (base64, 32 bytes) from the secret store. In
    /// Development a missing seed means a throwaway key; anywhere else startup
    /// refuses, because apps pin the key and a new one would break every update.
    /// </summary>
    public static IServiceCollection AddCatalogInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        var seed = configuration["Catalog:SigningSeed"];
        if (string.IsNullOrEmpty(seed))
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException("Catalog:SigningSeed is not set; a throwaway signing key is allowed only in Development.");
            services.AddSingleton<ICatalogSigner>(new Ed25519CatalogSigner(RandomNumberGenerator.GetBytes(32)));
        }
        else
        {
            services.AddSingleton<ICatalogSigner>(new Ed25519CatalogSigner(Convert.FromBase64String(seed)));
        }
        return services;
    }
}
