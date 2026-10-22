using System.Text.Json;
using Khazana.Identity.Application;
using Khazana.Identity.Domain;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Identity.Infrastructure;

/// <summary>
/// Verifies an OpenID Connect ID token from Google or Apple against the
/// provider's published keys: signature (RS256), issuer, audience (our client
/// ids only) and lifetime. Free: no account or API key is needed to verify.
/// </summary>
/// <remarks>
/// A token carrying a <c>nonce</c> must carry the device key's thumbprint, so an
/// ID token captured from one device can't start a session on another.
/// <see cref="RequireNonce"/> makes that mandatory once the apps always set it.
/// </remarks>
public sealed class OidcIdTokenVerifier(
    string provider,
    IReadOnlyCollection<string> issuers,
    IReadOnlyCollection<string> audiences,
    IConfigurationManager<OpenIdConnectConfiguration> keys,
    TimeProvider time) : IExternalIdentityVerifier
{
    private static readonly JsonWebTokenHandler Handler = new() { MapInboundClaims = false };

    public string Provider => provider;

    public bool RequireNonce { get; init; }

    public async Task<ExternalIdentity> VerifyAsync(string idToken, string deviceKeyThumbprint, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idToken) || idToken.Length > 8192)
            throw new ExternalTokenRejectedException("ID token missing or too long.");

        OpenIdConnectConfiguration config;
        try
        {
            config = await keys.GetConfigurationAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (InvalidOperationException e)
        {
            throw new ExternalTokenRejectedException($"{provider} keys unavailable.", e);
        }

        var result = await Handler.ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidIssuers = issuers,
            ValidAudiences = audiences,
            IssuerSigningKeys = config.SigningKeys,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            LifetimeValidator = (notBefore, expires, _, p) =>
            {
                var now = time.GetUtcNow().UtcDateTime;
                return (notBefore is null || notBefore <= now + p.ClockSkew) && expires is not null && expires > now - p.ClockSkew;
            },
        }).ConfigureAwait(false);
        if (!result.IsValid) throw new ExternalTokenRejectedException($"{provider} ID token invalid.", result.Exception);

        var claims = result.Claims;
        var subject = claims.TryGetValue("sub", out var sub) ? sub as string : null;
        if (string.IsNullOrEmpty(subject) || subject.Length > 255)
            throw new ExternalTokenRejectedException($"{provider} ID token has no subject.");

        var nonce = claims.TryGetValue("nonce", out var n) ? n as string : null;
        if (nonce is null ? RequireNonce : !string.Equals(nonce, deviceKeyThumbprint, StringComparison.Ordinal))
            throw new ExternalTokenRejectedException($"{provider} ID token is not bound to this device key.");

        // Keep an email only if the provider vouches for it. Google sends a
        // boolean; Apple has sent both a boolean and the string "true".
        var verified = claims.TryGetValue("email_verified", out var v) && v switch
        {
            bool b => b,
            string s => string.Equals(s, "true", StringComparison.OrdinalIgnoreCase),
            JsonElement { ValueKind: JsonValueKind.True } => true,
            _ => false,
        };
        var email = verified && claims.TryGetValue("email", out var e2) ? e2 as string : null;
        var name = claims.TryGetValue("name", out var nm) ? nm as string : null;
        return new ExternalIdentity(provider, subject, email, name);
    }

    public static OidcIdTokenVerifier Google(IReadOnlyCollection<string> clientIds, TimeProvider time, bool requireNonce) =>
        new(Providers.Google, ["https://accounts.google.com", "accounts.google.com"], clientIds,
            Discovery("https://accounts.google.com/.well-known/openid-configuration"), time) { RequireNonce = requireNonce };

    public static OidcIdTokenVerifier Apple(IReadOnlyCollection<string> clientIds, TimeProvider time, bool requireNonce) =>
        new(Providers.Apple, ["https://appleid.apple.com"], clientIds,
            Discovery("https://appleid.apple.com/.well-known/openid-configuration"), time) { RequireNonce = requireNonce };

    private static ConfigurationManager<OpenIdConnectConfiguration> Discovery(string url) =>
        new(url, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever { RequireHttps = true });
}

/// <summary>
/// Stands in for Google and Apple while developing and testing, so the whole
/// flow runs with no accounts (decision D15). The "ID token" is
/// <c>dev:&lt;subject&gt;</c> or <c>dev:&lt;subject&gt;:&lt;email&gt;</c>. Registered only in the
/// Development environment; startup refuses it anywhere else.
/// </summary>
public sealed class DevIdTokenVerifier : IExternalIdentityVerifier
{
    public string Provider => Providers.Dev;

    public Task<ExternalIdentity> VerifyAsync(string idToken, string deviceKeyThumbprint, CancellationToken cancellationToken)
    {
        var parts = (idToken ?? string.Empty).Split(':', 3);
        if (parts.Length < 2 || parts[0] != "dev" || parts[1].Length is 0 or > 64)
            throw new ExternalTokenRejectedException("Dev token must be dev:<subject>[:<email>].");
        var email = parts.Length == 3 && parts[2].Length is > 0 and <= 254 ? parts[2] : null;
        return Task.FromResult(new ExternalIdentity(Providers.Dev, parts[1], email, null));
    }
}
