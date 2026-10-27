namespace Khazana.AccountAggregator.Domain;

/// <summary>
/// One fetch under a consent (design doc §8.5): a persisted state machine.
/// The plaintext stage (the partner's data, decrypted) exists only in memory
/// inside one handler, between <see cref="Fetching"/> and <see cref="Sealed"/>,
/// so it is never a stored state.
/// </summary>
public enum FetchState
{
    /// <summary>Created; the FI data request has not been made yet.</summary>
    Requested,

    /// <summary>The partner accepted the FI request; waiting for its data-ready callback (or the poll).</summary>
    Fetching,

    /// <summary>Normalised, sealed to the user's delivery key and in the inbox. Nothing readable kept.</summary>
    Sealed,

    /// <summary>The app pulled and acknowledged the payload; it is deleted.</summary>
    Delivered,

    /// <summary>Gave up: retries spent, decrypt error, timeout, or the consent ended.</summary>
    Failed,

    /// <summary>Sealed but never collected within the inbox retention; the payload is deleted.</summary>
    Expired,
}

public static class FetchSagaRules
{
    /// <summary>Three attempts, then Failed and tell the user (§8.5, Fetching).</summary>
    public const int MaxAttempts = 3;

    private static readonly TimeSpan[] Backoff = [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15)];

    /// <summary>Wait before attempt <paramref name="attempt"/> + 1, after <paramref name="attempt"/> failures.</summary>
    public static TimeSpan RetryDelay(int attempt) => Backoff[Math.Clamp(attempt - 1, 0, Backoff.Length - 1)];

    public static bool IsInFlight(FetchState state) => state is FetchState.Requested or FetchState.Fetching;

    public static bool IsFinal(FetchState state) => !IsInFlight(state) && state != FetchState.Sealed;

    public static string Wire(FetchState state) => state.ToString().ToLowerInvariant();
}
