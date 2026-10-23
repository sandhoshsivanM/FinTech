namespace Khazana.Identity.Domain;

/// <summary>What a presented refresh token means.</summary>
public enum RefreshVerdict
{
    /// <summary>Rotate it: issue a new pair, mark this one used.</summary>
    Valid,

    /// <summary>Past its lifetime. The device signs in again.</summary>
    Expired,

    /// <summary>Its session was logged out or revoked.</summary>
    Revoked,

    /// <summary>
    /// Already rotated once. Either the app retried after losing the reply, or
    /// someone holds a copy. The two can't be told apart, so the whole session
    /// is revoked: a thief's copy and the real device both stop working, and the
    /// real user signs in again (RFC 9700 §4.14.2).
    /// </summary>
    Reused,

    /// <summary>
    /// Presented with a different device key than it was issued to. Only a copy
    /// can do that, so it is treated like reuse.
    /// </summary>
    WrongKey,
}

/// <summary>Refresh tokens: one use each, bound to the device key, 30 days.</summary>
public static class RefreshTokenRules
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    /// <summary>Refresh tokens carry 256 random bits.</summary>
    public const int TokenBytes = 32;

    /// <summary>
    /// Checked in order of severity: a revoked or reused token is reported as
    /// such even if it has also expired, so an attack is never mistaken for an
    /// ordinary timeout.
    /// </summary>
    public static RefreshVerdict Evaluate(
        DateTimeOffset expiresAt,
        DateTimeOffset? usedAt,
        DateTimeOffset? revokedAt,
        string boundJkt,
        string presentedJkt,
        DateTimeOffset now)
    {
        if (revokedAt is not null) return RefreshVerdict.Revoked;
        if (usedAt is not null) return RefreshVerdict.Reused;
        if (!string.Equals(boundJkt, presentedJkt, StringComparison.Ordinal)) return RefreshVerdict.WrongKey;
        if (now >= expiresAt) return RefreshVerdict.Expired;
        return RefreshVerdict.Valid;
    }

    /// <summary>Verdicts that end the whole session, not just this request.</summary>
    public static bool RevokesSession(RefreshVerdict verdict) =>
        verdict is RefreshVerdict.Reused or RefreshVerdict.WrongKey;
}

/// <summary>Access tokens: short, so a revoked session ends within minutes everywhere.</summary>
public static class AccessTokenRules
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);
}

public enum AccountStatus
{
    Active = 0,

    /// <summary>Deletion asked for; no sign-in until it completes.</summary>
    DeletionRequested = 1,
}

public static class AccountDeletion
{
    /// <summary>Time to change one's mind before every service deletes (design doc §8.5).</summary>
    public static readonly TimeSpan CoolingOff = TimeSpan.FromHours(24);
}

/// <summary>The apps that may sign in. Anything else is refused, not stored.</summary>
public static class Platforms
{
    public static readonly IReadOnlySet<string> Known =
        new HashSet<string>(StringComparer.Ordinal) { "android", "ios", "web", "macos", "windows", "linux" };

    public static bool IsKnown(string? platform) => platform is not null && Known.Contains(platform);
}

/// <summary>Where a sign-in was vouched for.</summary>
public static class Providers
{
    public const string Google = "google";
    public const string Apple = "apple";

    /// <summary>Development-only stand-in for Google and Apple. Refused in Production at startup.</summary>
    public const string Dev = "dev";

    public const string Passkey = "passkey";

    /// <summary>Creates an account from a passkey alone (sign-up); sign-in afterwards is <see cref="Passkey"/>.</summary>
    public const string PasskeySignUp = "passkey_signup";
}
