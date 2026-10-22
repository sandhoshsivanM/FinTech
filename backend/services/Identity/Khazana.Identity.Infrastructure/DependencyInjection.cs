using Fido2NetLib;
using Khazana.Identity.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.Identity.Infrastructure;

/// <summary>Settings under <c>Identity</c>.</summary>
public sealed class IdentityOptions
{
    public const string Section = "Identity";

    /// <summary>"Ephemeral" (Development only) or "Pem".</summary>
    public string SigningKey { get; set; } = "Ephemeral";

    /// <summary>PKCS#8 PEM file with the EC P-256 signing key, for <c>SigningKey=Pem</c>.</summary>
    public string? SigningKeyPath { get; set; }

    /// <summary>Accept <c>dev:</c> tokens instead of Google and Apple. Development only.</summary>
    public bool DevSignIn { get; set; }

    /// <summary>OAuth client ids the Google ID tokens must be issued to (Android, iOS, web). Empty disables Google.</summary>
    public IReadOnlyList<string> GoogleClientIds { get; set; } = [];

    /// <summary>App and Services IDs for Sign in with Apple. Empty disables Apple.</summary>
    public IReadOnlyList<string> AppleClientIds { get; set; } = [];

    /// <summary>Refuse ID tokens without a nonce bound to the device key.</summary>
    public bool RequireNonce { get; set; }

    public PasskeyOptions Passkeys { get; set; } = new();
}

public sealed class PasskeyOptions
{
    /// <summary>The relying party id: the registrable domain passkeys belong to.</summary>
    public string RpId { get; set; } = "localhost";

    public string RpName { get; set; } = "Khazana";

    /// <summary>
    /// Origins allowed to use them: https web origins, plus the Android app's
    /// <c>android:apk-key-hash:…</c> origin.
    /// </summary>
    public IReadOnlyList<string> Origins { get; set; } = ["http://localhost"];
}

public static class DependencyInjection
{
    /// <summary>
    /// Registers Identity's adapters. Every unsafe combination fails at
    /// startup: a dev sign-in or a throwaway signing key outside Development,
    /// a missing or short field secret, an unknown signing-key choice.
    /// </summary>
    public static IServiceCollection AddIdentityInfrastructure(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        var options = configuration.GetSection(IdentityOptions.Section).Get<IdentityOptions>() ?? new();
        services.AddSingleton(options);

        services.AddSingleton<IFieldProtector>(new AesGcmFieldProtector(
            configuration["Identity:Secrets:FieldKey"] ?? throw new InvalidOperationException("Identity:Secrets:FieldKey is not set.")));

        services.AddSingleton<ISigningKeys>(options.SigningKey switch
        {
            "Ephemeral" when !environment.IsDevelopment() => throw new InvalidOperationException(
                "Identity:SigningKey=Ephemeral is allowed only in Development: every restart would sign every user out."),
            "Ephemeral" => EcdsaSigningKeys.Ephemeral(),
            "Pem" => EcdsaSigningKeys.FromPemFile(options.SigningKeyPath
                ?? throw new InvalidOperationException("Identity:SigningKeyPath is not set.")),
            _ => throw new InvalidOperationException($"Unknown Identity:SigningKey '{options.SigningKey}'. Use Pem or Ephemeral."),
        });

        services.AddSingleton(TimeProvider.System);
        if (options.DevSignIn)
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException(
                    "Identity:DevSignIn is allowed only in Development: it lets anyone sign in as anyone.");
            services.AddSingleton<IExternalIdentityVerifier, DevIdTokenVerifier>();
        }
        if (options.GoogleClientIds.Count > 0)
        {
            services.AddSingleton<IExternalIdentityVerifier>(sp =>
                OidcIdTokenVerifier.Google(options.GoogleClientIds, sp.GetRequiredService<TimeProvider>(), options.RequireNonce));
        }
        if (options.AppleClientIds.Count > 0)
        {
            services.AddSingleton<IExternalIdentityVerifier>(sp =>
                OidcIdTokenVerifier.Apple(options.AppleClientIds, sp.GetRequiredService<TimeProvider>(), options.RequireNonce));
        }

        services.AddSingleton<IMetadataService, NoMetadataService>();
        services.AddSingleton(new Fido2Configuration
        {
            RPID = options.Passkeys.RpId,
            RPName = options.Passkeys.RpName,
            Origins = new HashSet<string>(options.Passkeys.Origins, StringComparer.Ordinal),
            TimestampDriftTolerance = 300_000,
        });
        services.AddScoped<IFido2, Fido2>();
        return services;
    }
}

/// <summary>
/// Attestation is not requested (passkeys from any authenticator are welcome),
/// so the FIDO metadata service is never consulted.
/// </summary>
internal sealed class NoMetadataService : IMetadataService
{
    public bool ConformanceTesting() => false;

    public Task<MetadataBLOBPayloadEntry?> GetEntryAsync(Guid aaguid, CancellationToken cancellationToken = default) =>
        Task.FromResult<MetadataBLOBPayloadEntry?>(null);
}
