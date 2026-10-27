using System.Security.Cryptography;
using Khazana.Identity.Domain;
using Khazana.SharedKernel;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Identity.Application;

public sealed record IssuedAccessToken(string Token, int ExpiresInSeconds);

/// <summary>Mints access tokens and refresh tokens.</summary>
public sealed class TokenIssuer(ISigningKeys keys, TokenSettings settings, IClock clock)
{
    /// <summary>Same name and lifetime as <c>KhazanaClaims.StepUp</c> and <c>StepUpLifetime</c>, which Devices & Keys checks.</summary>
    public const string StepUpClaim = "sua";
    public static readonly TimeSpan StepUpLifetime = TimeSpan.FromMinutes(2);

    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };

    /// <summary>
    /// A 15-minute ES256 JWT (<c>typ: at+jwt</c>, RFC 9068) bound to the device
    /// key through <c>cnf.jkt</c> (RFC 9449). It names the user and device by
    /// id only: no email, no name.
    /// </summary>
    public IssuedAccessToken IssueAccess(Guid userId, Guid deviceId, string jkt) => Issue(userId, deviceId, jkt, stepUp: false);

    /// <summary>
    /// A two-minute token like <see cref="IssueAccess"/> plus the <c>sua</c> claim:
    /// the passkey check that was just made. Sensitive actions (removing a
    /// device) ask for it; it comes with no refresh token.
    /// </summary>
    public IssuedAccessToken IssueStepUp(Guid userId, Guid deviceId, string jkt) => Issue(userId, deviceId, jkt, stepUp: true);

    private IssuedAccessToken Issue(Guid userId, Guid deviceId, string jkt, bool stepUp)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(jkt);
        var now = clock.UtcNow;
        var lifetime = stepUp ? StepUpLifetime : AccessTokenRules.Lifetime;
        var claims = new Dictionary<string, object>
        {
            ["sub"] = userId.ToString(),
            ["did"] = deviceId.ToString(),
            ["jti"] = Guid.NewGuid().ToString("N"),
            ["cnf"] = new Dictionary<string, object> { ["jkt"] = jkt },
        };
        if (stepUp) claims[StepUpClaim] = now.ToUnixTimeSeconds();
        var token = Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Audience = settings.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = (now + lifetime).UtcDateTime,
            TokenType = "at+jwt",
            SigningCredentials = keys.Current,
            Claims = claims,
        });
        return new IssuedAccessToken(token, (int)lifetime.TotalSeconds);
    }

    /// <summary>256 random bits, base64url. Only its hash is stored.</summary>
    public static (string Raw, byte[] Hash) NewRefreshToken()
    {
        var raw = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(RefreshTokenRules.TokenBytes));
        return (raw, HashRefreshToken(raw));
    }

    /// <summary>
    /// Plain SHA-256 is enough here: the input is 256 random bits, so there is
    /// nothing to brute-force, unlike a password.
    /// </summary>
    public static byte[] HashRefreshToken(string raw) =>
        SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(raw ?? string.Empty));
}
