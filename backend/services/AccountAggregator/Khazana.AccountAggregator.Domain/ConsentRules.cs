namespace Khazana.AccountAggregator.Domain;

/// <summary>
/// A consent's life (design doc §8.5). Only <see cref="Active"/> allows a
/// fetch; every other state is final except <see cref="Pending"/>.
/// </summary>
public enum ConsentStatus
{
    /// <summary>Created with the partner; the user has not approved it at their AA yet.</summary>
    Pending,
    Active,

    /// <summary>The user paused it at their AA. No fetches until it is active again.</summary>
    Paused,
    Revoked,
    Expired,

    /// <summary>The user rejected it, or never approved it within <see cref="ConsentRules.ApprovalWindow"/>.</summary>
    Rejected,
}

/// <summary>How often scheduled fetches run under a consent.</summary>
public enum FetchFrequency
{
    Daily,
    Weekly,
    Monthly,
}

/// <summary>
/// Financial information types, named as in the ReBIT/Sahamati FI schemas.
/// EPF and PPF are not live on AA yet (design doc §12); the sample provider
/// serves them so the app's import can be built and tested now.
/// </summary>
public static class FiTypes
{
    public const string Deposit = "DEPOSIT";
    public const string TermDeposit = "TERM_DEPOSIT";
    public const string RecurringDeposit = "RECURRING_DEPOSIT";
    public const string MutualFunds = "MUTUAL_FUNDS";
    public const string Equities = "EQUITIES";
    public const string Etf = "ETF";
    public const string Nps = "NPS";
    public const string Epf = "EPF";
    public const string Ppf = "PPF";
    public const string Insurance = "INSURANCE_POLICIES";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Deposit, TermDeposit, RecurringDeposit, MutualFunds, Equities, Etf, Nps, Epf, Ppf, Insurance,
    };
}

public static class ConsentRules
{
    /// <summary>A consent request the user hasn't approved in 24 hours is dropped (§8.5, Requested).</summary>
    public static readonly TimeSpan ApprovalWindow = TimeSpan.FromHours(24);

    /// <summary>Default and longest consent validity. Shorter is the user's choice.</summary>
    public const int DefaultValidityDays = 365;
    public const int MaxValidityDays = 365;

    /// <summary>How far back data may be asked for, and the default first window.</summary>
    public const int MaxHistoryDays = 2 * 365;
    public const int DefaultHistoryDays = 180;

    /// <summary>Undelivered sealed payloads are deleted after 14 days (§8.9).</summary>
    public static readonly TimeSpan InboxRetention = TimeSpan.FromDays(14);

    /// <summary>Scheduled fetches skip users who haven't opened the app in 30 days (§8.5, §12).</summary>
    public static readonly TimeSpan InactiveAfter = TimeSpan.FromDays(30);

    /// <summary>"Fetch now" on app open runs only when the last fetch is older than this (§8.5).</summary>
    public static readonly TimeSpan OnOpenMinAge = TimeSpan.FromHours(24);

    /// <summary>A fetch the partner never answers is given up after this.</summary>
    public static readonly TimeSpan FetchTimeout = TimeSpan.FromHours(1);

    /// <summary>While waiting for the partner's data-ready callback, poll as a fallback this often.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(2);

    public static TimeSpan Interval(FetchFrequency frequency) => frequency switch
    {
        FetchFrequency.Daily => TimeSpan.FromDays(1),
        FetchFrequency.Monthly => TimeSpan.FromDays(30),
        _ => TimeSpan.FromDays(7),
    };

    /// <summary>The wire name of a status, as the API and events carry it.</summary>
    public static string Wire(ConsentStatus status) => status.ToString().ToLowerInvariant();

    public static string Wire(FetchFrequency frequency) => frequency.ToString().ToLowerInvariant();

    public static bool TryParseFrequency(string? value, out FetchFrequency frequency)
    {
        frequency = FetchFrequency.Weekly;
        if (value is null) return true;
        // Names only: Enum.TryParse would also take "1" or "7".
        return value.Length > 0 && char.IsLetter(value[0]) &&
               Enum.TryParse(value, ignoreCase: true, out frequency) && Enum.IsDefined(frequency);
    }

    /// <summary>Normalises and checks the FI types a user asked for: known, not empty, no duplicates.</summary>
    public static string[]? CleanFiTypes(IReadOnlyCollection<string>? requested)
    {
        if (requested is null || requested.Count == 0 || requested.Count > FiTypes.All.Count) return null;
        var cleaned = requested.Select(t => (t ?? string.Empty).Trim().ToUpperInvariant()).Distinct(StringComparer.Ordinal).ToArray();
        return cleaned.Length == requested.Count && cleaned.All(FiTypes.All.Contains) ? [.. cleaned.Order(StringComparer.Ordinal)] : null;
    }

    /// <summary>The data window asked for: inside the history limit and not in the future.</summary>
    public static bool IsValidRange(DateOnly from, DateOnly to, DateOnly today) =>
        from <= to && to <= today && from >= today.AddDays(-MaxHistoryDays);

    /// <summary>The one gate every fetch passes: an active consent that hasn't expired.</summary>
    public static bool AllowsFetch(ConsentStatus status, DateTimeOffset expiresAt, DateTimeOffset now) =>
        status == ConsentStatus.Active && expiresAt > now;
}
