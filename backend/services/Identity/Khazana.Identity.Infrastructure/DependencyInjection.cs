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

    /// <summary>Refuse ID tokens without a nonce bound to the device key. Mandatory outside Development.</summary>
    public bool RequireNonce { get; set; }

    public PasskeyOptions Passkeys { get; set; } = new();

    public PhoneOptions Phone { get; set; } = new();
}

public sealed class PhoneOptions
{
    /// <summary>Calling codes that may sign in with a number. India only until a provider and DLT are in place.</summary>
    public IReadOnlyList<string> AllowedCountryCodes { get; set; } = ["+91"];

    /// <summary>Return the code in the API response, for a demo with no SMS provider. Fake sender only; refused in Production.</summary>
    public bool EchoCode { get; set; }
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
        // A Google or Apple ID token without a nonce bound to the device key can
        // be replayed from any device for its lifetime. Outside Development the
        // binding is mandatory.
        if ((options.GoogleClientIds.Count > 0 || options.AppleClientIds.Count > 0) && !options.RequireNonce && !environment.IsDevelopment())
            throw new InvalidOperationException(
                "Identity:RequireNonce must be true outside Development: an unbound ID token can be replayed from another device.");
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

        AddSms(services, configuration, environment, options.Phone);

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

    /// <summary>
    /// Mirrors <c>Providers:Push</c> (ADR 0003). Fake texts nothing and is refused in
    /// Production; Msg91 stops startup without its settings; Disabled (the default
    /// outside Development) turns phone sign-in off.
    /// </summary>
    private static void AddSms(IServiceCollection services, IConfiguration configuration, IHostEnvironment environment, PhoneOptions phone)
    {
        var mode = configuration["Providers:Sms"] ?? (environment.IsDevelopment() ? "Fake" : "Disabled");
        if (phone.AllowedCountryCodes.Count == 0 || phone.AllowedCountryCodes.Any(c => c.Length < 2 || c[0] != '+' || !c.Skip(1).All(char.IsAsciiDigit)))
            throw new InvalidOperationException("Identity:Phone:AllowedCountryCodes must be calling codes like +91.");
        if (phone.EchoCode && environment.IsProduction())
            throw new InvalidOperationException(
                "Identity:Phone:EchoCode is not allowed in Production: it hands the SMS code to whoever asks for it.");
        if (phone.EchoCode && mode != "Fake")
            throw new InvalidOperationException("Identity:Phone:EchoCode needs Providers:Sms=Fake: a real provider's code must go only to the phone.");

        services.AddSingleton(new PhoneOtpSettings(phone.AllowedCountryCodes, phone.EchoCode));
        switch (mode)
        {
            case "Fake" when environment.IsProduction():
                throw new InvalidOperationException(
                    "Providers:Sms=Fake is not allowed in Production: the code is only logged, never texted.");
            case "Fake":
                services.AddSingleton<FakeSmsLog>();
                services.AddSingleton<ISmsSender, LogSmsSender>();
                break;
            case "Msg91":
                var msg91 = new Msg91Options
                {
                    AuthKey = configuration["Sms:Msg91:AuthKey"] ?? throw new InvalidOperationException("Sms:Msg91:AuthKey is not set."),
                    TemplateId = configuration["Sms:Msg91:TemplateId"] ?? throw new InvalidOperationException("Sms:Msg91:TemplateId is not set."),
                };
                services.AddHttpClient(nameof(Msg91SmsSender));
                services.AddSingleton<ISmsSender>(sp =>
                    new Msg91SmsSender(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(Msg91SmsSender)), msg91));
                break;
            case "Disabled":
                break;
            default:
                throw new InvalidOperationException($"Unknown Providers:Sms '{mode}'. Use Fake, Msg91 or Disabled.");
        }
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
