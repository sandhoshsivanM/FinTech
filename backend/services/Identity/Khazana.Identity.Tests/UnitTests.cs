using System.Security.Cryptography;
using System.Text;
using Khazana.Identity.Application;
using Khazana.Identity.Domain;
using Khazana.Identity.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Shouldly;

namespace Khazana.Identity.Tests;

public class RefreshTokenRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void An_unused_token_from_the_same_key_is_valid() =>
        RefreshTokenRules.Evaluate(Now.AddDays(1), null, null, "k", "k", Now).ShouldBe(RefreshVerdict.Valid);

    [Fact]
    public void A_used_token_is_reuse_and_ends_the_session()
    {
        var verdict = RefreshTokenRules.Evaluate(Now.AddDays(1), Now.AddMinutes(-1), null, "k", "k", Now);
        verdict.ShouldBe(RefreshVerdict.Reused);
        RefreshTokenRules.RevokesSession(verdict).ShouldBeTrue();
    }

    [Fact]
    public void Another_key_is_treated_like_reuse()
    {
        var verdict = RefreshTokenRules.Evaluate(Now.AddDays(1), null, null, "k", "thief", Now);
        verdict.ShouldBe(RefreshVerdict.WrongKey);
        RefreshTokenRules.RevokesSession(verdict).ShouldBeTrue();
    }

    [Fact]
    public void Reuse_is_reported_even_when_the_token_has_also_expired() =>
        RefreshTokenRules.Evaluate(Now.AddDays(-1), Now.AddDays(-2), null, "k", "k", Now).ShouldBe(RefreshVerdict.Reused);

    [Fact]
    public void Expiry_and_revocation_refuse_without_ending_anything_else()
    {
        RefreshTokenRules.Evaluate(Now, null, null, "k", "k", Now).ShouldBe(RefreshVerdict.Expired);
        RefreshTokenRules.Evaluate(Now.AddDays(1), null, Now, "k", "k", Now).ShouldBe(RefreshVerdict.Revoked);
        RefreshTokenRules.RevokesSession(RefreshVerdict.Expired).ShouldBeFalse();
    }
}

public class FieldProtectorTests
{
    private readonly AesGcmFieldProtector _protector = new(new string('s', 48));

    [Fact]
    public void Round_trips_and_never_stores_the_plaintext()
    {
        var c = _protector.Encrypt("asha@example.com", "email");
        Encoding.UTF8.GetString(c).ShouldNotContain("asha");
        _protector.Decrypt(c, "email").ShouldBe("asha@example.com");
    }

    [Fact]
    public void The_same_value_encrypts_differently_each_time() =>
        _protector.Encrypt("x", "email").ShouldNotBe(_protector.Encrypt("x", "email"));

    [Fact]
    public void A_ciphertext_moved_to_another_field_or_tampered_with_fails()
    {
        var c = _protector.Encrypt("asha@example.com", "email");
        Should.Throw<CryptographicException>(() => _protector.Decrypt(c, "display-name"));
        c[^1] ^= 1;
        Should.Throw<CryptographicException>(() => _protector.Decrypt(c, "email"));
    }

    [Fact]
    public void Hashes_are_stable_keyed_and_separated_by_purpose()
    {
        _protector.Hash("sub-1", "subject").ShouldBe(_protector.Hash("sub-1", "subject"));
        _protector.Hash("sub-1", "subject").ShouldNotBe(_protector.Hash("sub-1", "email"));
        new AesGcmFieldProtector(new string('t', 48)).Hash("sub-1", "subject")
            .ShouldNotBe(_protector.Hash("sub-1", "subject"), "a different secret gives different hashes");
    }

    [Fact]
    public void A_short_secret_is_refused() =>
        Should.Throw<InvalidOperationException>(() => new AesGcmFieldProtector("too-short"));
}

/// <summary>Google and Apple ID tokens, verified against keys the test controls.</summary>
public sealed class OidcIdTokenVerifierTests : IDisposable
{
    private const string Issuer = "https://accounts.google.com";
    private const string ClientId = "khazana-android";
    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RsaSecurityKey _key;

    public OidcIdTokenVerifierTests() => _key = new RsaSecurityKey(_rsa) { KeyId = "google-1" };

    private OidcIdTokenVerifier Verifier(bool requireNonce = false)
    {
        var config = new OpenIdConnectConfiguration();
        config.SigningKeys.Add(_key);
        return new OidcIdTokenVerifier(Providers.Google, [Issuer], [ClientId],
            new StaticConfigurationManager<OpenIdConnectConfiguration>(config), TimeProvider.System) { RequireNonce = requireNonce };
    }

    private string IdToken(
        string audience = ClientId, string issuer = Issuer, DateTime? expires = null, string? nonce = null,
        bool emailVerified = true, SecurityKey? key = null)
    {
        var claims = new Dictionary<string, object>
        {
            ["sub"] = "1098765", ["email"] = "asha@example.com", ["email_verified"] = emailVerified, ["name"] = "Asha",
        };
        if (nonce is not null) claims["nonce"] = nonce;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer, Audience = audience, Claims = claims,
            IssuedAt = DateTime.UtcNow.AddMinutes(-1), NotBefore = DateTime.UtcNow.AddMinutes(-1),
            Expires = expires ?? DateTime.UtcNow.AddMinutes(30),
            SigningCredentials = new SigningCredentials(key ?? _key, SecurityAlgorithms.RsaSha256),
        });
    }

    [Fact]
    public async Task A_valid_token_gives_the_subject_and_the_verified_email()
    {
        var who = await Verifier().VerifyAsync(IdToken(), "jkt", TestContext.Current.CancellationToken);
        who.Subject.ShouldBe("1098765");
        who.Email.ShouldBe("asha@example.com");
        who.DisplayName.ShouldBe("Asha");
    }

    [Fact]
    public async Task An_unverified_email_is_dropped() =>
        (await Verifier().VerifyAsync(IdToken(emailVerified: false), "jkt", TestContext.Current.CancellationToken)).Email.ShouldBeNull();

    [Fact]
    public async Task A_token_for_another_app_is_refused() =>
        await Refused(IdToken(audience: "someone-elses-app"));

    [Fact]
    public async Task A_token_from_another_issuer_is_refused() =>
        await Refused(IdToken(issuer: "https://evil.example"));

    [Fact]
    public async Task An_expired_token_is_refused() =>
        await Refused(IdToken(expires: DateTime.UtcNow.AddMinutes(-10)));

    [Fact]
    public async Task A_token_signed_by_another_key_is_refused()
    {
        using var other = RSA.Create(2048);
        await Refused(IdToken(key: new RsaSecurityKey(other) { KeyId = "google-1" }));
    }

    [Fact]
    public async Task A_nonce_must_be_this_devices_key()
    {
        await Verifier().VerifyAsync(IdToken(nonce: "jkt"), "jkt", TestContext.Current.CancellationToken);
        await Refused(IdToken(nonce: "another-device"));
    }

    [Fact]
    public async Task With_RequireNonce_a_token_without_one_is_refused() =>
        await Should.ThrowAsync<ExternalTokenRejectedException>(() =>
            Verifier(requireNonce: true).VerifyAsync(IdToken(), "jkt", TestContext.Current.CancellationToken));

    private async Task Refused(string token) =>
        await Should.ThrowAsync<ExternalTokenRejectedException>(() =>
            Verifier().VerifyAsync(token, "jkt", TestContext.Current.CancellationToken));

    public void Dispose() => _rsa.Dispose();
}

public class StartupGuardTests
{
    private static readonly Dictionary<string, string?> Safe = new()
    {
        ["Identity:Secrets:FieldKey"] = new string('k', 48),
        ["Identity:SigningKey"] = "Ephemeral",
    };

    [Fact]
    public void Dev_sign_in_is_refused_outside_Development()
    {
        var e = Should.Throw<InvalidOperationException>(() =>
            Register(new(Safe) { ["Identity:SigningKey"] = "Pem", ["Identity:SigningKeyPath"] = WriteKey(), ["Identity:DevSignIn"] = "true" }, Environments.Production));
        e.Message.ShouldContain("DevSignIn");
        Should.Throw<InvalidOperationException>(() =>
            Register(new(Safe) { ["Identity:SigningKey"] = "Pem", ["Identity:SigningKeyPath"] = WriteKey(), ["Identity:DevSignIn"] = "true" }, Environments.Staging));
    }

    [Fact]
    public void Google_sign_in_without_nonce_binding_is_refused_outside_Development() =>
        Should.Throw<InvalidOperationException>(() => Register(new(Safe)
        {
            ["Identity:SigningKey"] = "Pem", ["Identity:SigningKeyPath"] = WriteKey(),
            ["Identity:GoogleClientIds:0"] = "khazana-android", ["Identity:RequireNonce"] = "false",
        }, Environments.Production)).Message.ShouldContain("RequireNonce");

    [Fact]
    public void A_throwaway_signing_key_is_refused_outside_Development() =>
        Should.Throw<InvalidOperationException>(() => Register(Safe, Environments.Production)).Message.ShouldContain("Ephemeral");

    [Fact]
    public void A_missing_field_secret_is_refused() =>
        Should.Throw<InvalidOperationException>(() =>
            Register(new(Safe) { ["Identity:Secrets:FieldKey"] = null }, Environments.Development));

    [Fact]
    public void Production_starts_with_a_real_key_and_no_dev_sign_in() =>
        Should.NotThrow(() => Register(new(Safe) { ["Identity:SigningKey"] = "Pem", ["Identity:SigningKeyPath"] = WriteKey() }, Environments.Production));

    private static void Register(Dictionary<string, string?> values, string environment) =>
        new ServiceCollection().AddIdentityInfrastructure(
            new ConfigurationBuilder().AddInMemoryCollection(values).Build(), new FakeEnvironment(environment));

    private static string WriteKey()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var path = Path.GetTempFileName();
        File.WriteAllText(path, key.ExportPkcs8PrivateKeyPem());
        return path;
    }

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
