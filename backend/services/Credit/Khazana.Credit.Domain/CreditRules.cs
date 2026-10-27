using System.Text.RegularExpressions;

namespace Khazana.Credit.Domain;

public enum PullStatus
{
    /// <summary>The bureau call is running. One per user at a time.</summary>
    InProgress,
    Succeeded,
    Failed,
}

public static partial class CreditRules
{
    /// <summary>One pull per 30 days (design doc §8.2); quarterly is the app's default refresh.</summary>
    public static readonly TimeSpan PullInterval = TimeSpan.FromDays(30);

    /// <summary>Undelivered sealed reports are deleted after 14 days (§8.9).</summary>
    public static readonly TimeSpan InboxRetention = TimeSpan.FromDays(14);

    /// <summary>A pull still "in progress" after this crashed mid-call; it is marked failed.</summary>
    public static readonly TimeSpan StuckAfter = TimeSpan.FromMinutes(10);

    /// <summary>The only purpose a pull may have: the user reviewing their own credit.</summary>
    public const string Purpose = "personal_credit_review";

    public const int MaxNameLength = 100;

    [GeneratedRegex("^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$")]
    private static partial Regex PanPattern();

    [GeneratedRegex("^[6-9][0-9]{9}$")]
    private static partial Regex MobilePattern();

    /// <summary>
    /// A PAN in the Income Tax format (fourth letter is the holder type). Used
    /// for the one bureau call and never stored, logged or returned.
    /// </summary>
    public static bool IsValidPan(string? pan) => pan is { Length: 10 } && PanPattern().IsMatch(pan);

    /// <summary>An Indian mobile number, ten digits without the country code.</summary>
    public static bool IsValidMobile(string? mobile) => mobile is { Length: 10 } && MobilePattern().IsMatch(mobile);

    public static bool IsValidName(string? name) =>
        name is null || (name.Length is > 0 and <= MaxNameLength && !name.Any(char.IsControl));

    /// <summary>When the user may pull again, given their last successful pull.</summary>
    public static DateTimeOffset? NextAllowedAt(DateTimeOffset? lastSuccess) => lastSuccess + PullInterval;

    public static string Wire(PullStatus status) => status switch
    {
        PullStatus.InProgress => "in_progress",
        _ => status.ToString().ToLowerInvariant(),
    };
}
