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

    /// <summary>A mobile number proved with an SMS code. A convenience sign-in: it never grants step-up (ADR 0004).</summary>
    public const string Phone = "phone";

    /// <summary>Creates an account from a passkey alone (sign-up); sign-in afterwards is <see cref="Passkey"/>.</summary>
    public const string PasskeySignUp = "passkey_signup";
}

/// <summary>Rules for the SMS sign-in code (ADR 0004): short-lived, few tries, few texts.</summary>
public static class PhoneOtpRules
{
    public const int CodeLength = 6;
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    /// <summary>Wrong guesses allowed per code. 5 of 10^6 is a 1-in-200,000 chance for a blind attacker.</summary>
    public const int MaxVerifyAttempts = 5;

    /// <summary>Gap between two texts to one number.</summary>
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(30);

    public const int PerPhoneWindowLimit = 3;
    public static readonly TimeSpan PerPhoneWindow = TimeSpan.FromMinutes(15);
    public const int PerPhoneDayLimit = 10;

    /// <summary>Per device key, which stops one client spraying many numbers.</summary>
    public const int PerDeviceWindowLimit = 5;
    public const int PerDeviceDayLimit = 20;
    public static readonly TimeSpan Day = TimeSpan.FromHours(24);

    public static bool IsWellFormed(string? code) =>
        code is { Length: CodeLength } && code.All(char.IsAsciiDigit);
}

/// <summary>Mobile numbers: one canonical E.164 form, so the same number always hashes the same.</summary>
public static class PhoneNumbers
{
    /// <summary>Calling codes accepted unless configured otherwise. India only for now.</summary>
    public static readonly IReadOnlyList<string> DefaultAllowed = ["+91"];

    /// <summary>
    /// Returns the E.164 form, or null when the input is not a mobile number
    /// under an allowed calling code. A bare 10-digit number is read as the
    /// first allowed country's. Indian mobiles are 10 digits starting 6 to 9.
    /// </summary>
    public static string? Normalize(string? input, IReadOnlyList<string> allowedPrefixes)
    {
        ArgumentNullException.ThrowIfNull(allowedPrefixes);
        if (string.IsNullOrWhiteSpace(input) || input.Length > 32 || allowedPrefixes.Count == 0) return null;
        var plus = input.TrimStart().StartsWith('+');
        var digits = new string([.. input.Where(char.IsAsciiDigit)]);
        if (input.Any(c => !(char.IsAsciiDigit(c) || c is '+' or ' ' or '-' or '(' or ')' or '.'))) return null;
        if (input.Count(c => c == '+') > 1 || (input.Contains('+', StringComparison.Ordinal) && !plus)) return null;

        string e164;
        if (plus)
        {
            e164 = "+" + digits;
        }
        else if (digits.Length == 10)
        {
            e164 = allowedPrefixes[0] + digits;
        }
        else if (digits.Length == 11 && digits[0] == '0')
        {
            e164 = allowedPrefixes[0] + digits[1..];
        }
        else
        {
            e164 = "+" + digits;
        }

        if (e164.Length is < 9 or > 16 || e164[1] == '0') return null;
        var prefix = allowedPrefixes.FirstOrDefault(p => e164.StartsWith(p, StringComparison.Ordinal));
        if (prefix is null) return null;
        if (prefix == "+91" && !(e164.Length == 13 && e164[3] is >= '6' and <= '9')) return null;
        return e164;
    }

    /// <summary>"+91 ******1234": for logs. Never the whole number.</summary>
    public static string Mask(string e164) =>
        e164.Length <= 6 ? "***" : string.Concat(e164.AsSpan(0, 3), " ******", e164.AsSpan(e164.Length - 4));
}
