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
    private static readonly JsonWebTokenHandler Handler = new() { SetDefaultTimesOnTokenCreation = false };

    /// <summary>
    /// A 15-minute ES256 JWT (<c>typ: at+jwt</c>, RFC 9068) bound to the device
    /// key through <c>cnf.jkt</c> (RFC 9449). It names the user and device by
    /// id only: no email, no name.
    /// </summary>
    public IssuedAccessToken IssueAccess(Guid userId, Guid deviceId, string jkt)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(jkt);
        var now = clock.UtcNow;
        var token = Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Audience = settings.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = (now + AccessTokenRules.Lifetime).UtcDateTime,
            TokenType = "at+jwt",
            SigningCredentials = keys.Current,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = userId.ToString(),
                ["did"] = deviceId.ToString(),
                ["jti"] = Guid.NewGuid().ToString("N"),
                ["cnf"] = new Dictionary<string, object> { ["jkt"] = jkt },
            },
        });
        return new IssuedAccessToken(token, (int)AccessTokenRules.Lifetime.TotalSeconds);
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
