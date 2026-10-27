using Khazana.AccountAggregator.Domain;

namespace Khazana.AccountAggregator.Application;

/// <summary>
/// The Account Aggregator partner (design doc §13.3, decision D15): sample
/// data now, the Finvu sandbox next, a regulated FIU partner in production
/// (decision D4). Chosen by <c>Providers:AccountAggregator</c>.
/// </summary>
/// <remarks>
/// The adapter does everything partner-specific: the consent artefact, the
/// FI request, decrypting the partner's payload with the FIU key (KMS in the
/// cloud) and normalising it into a <see cref="FiBundle"/>. What it returns is
/// plaintext that lives only in memory until the saga seals it.
/// </remarks>
public interface IBankDataProvider
{
    /// <summary>Stored with each consent, so a consent is only ever handled by the adapter that made it.</summary>
    string Name { get; }

    /// <summary>Creates the consent request. The user approves it at their AA, then the partner calls back.</summary>
    Task<ConsentCreated> CreateConsentAsync(ConsentRequest request, CancellationToken ct);

    Task<ConsentStatus> GetConsentStatusAsync(string consentHandle, CancellationToken ct);

    /// <summary>Revokes at the partner. Idempotent: revoking an ended consent succeeds.</summary>
    Task RevokeConsentAsync(string consentHandle, CancellationToken ct);

    /// <summary>Asks for FI data for a window. The partner may have it at once or call back when ready.</summary>
    Task<FiRequestStarted> RequestFiDataAsync(string consentHandle, DateOnly dataFrom, DateOnly dataTo, CancellationToken ct);

    /// <summary>Collects, decrypts and normalises the data; <see cref="FiFetchResult.Bundle"/> is null while it isn't ready.</summary>
    Task<FiFetchResult> FetchFiDataAsync(FiFetchContext context, CancellationToken ct);

    /// <summary>
    /// Checks a partner callback's signature and freshness and reads it. Null
    /// when the signature, the timestamp or the body is wrong: the caller
    /// answers 401 and does nothing else.
    /// </summary>
    AaCallback? VerifyCallback(byte[] body, Func<string, string?> header, DateTimeOffset now);
}

/// <param name="AaHandle">The user's AA id (e.g. <c>98xxxxxx10@finvu</c>), passed to the partner once and never stored.</param>
public sealed record ConsentRequest(
    Guid ConsentId,
    Guid UserId,
    string? AaHandle,
    IReadOnlyList<string> FiTypes,
    DateOnly DataFrom,
    DateOnly DataTo,
    FetchFrequency Frequency,
    DateTimeOffset ExpiresAt);

/// <param name="Handle">The partner's consent handle.</param>
/// <param name="RedirectUrl">Where the app sends the user to approve, if the partner uses a redirect.</param>
public sealed record ConsentCreated(string Handle, Uri? RedirectUrl);

/// <param name="DataReady">True when the data can be collected now (no callback to wait for).</param>
public sealed record FiRequestStarted(string SessionId, bool DataReady);

public sealed record FiFetchContext(
    Guid ConsentId,
    string ConsentHandle,
    string SessionId,
    IReadOnlyList<string> FiTypes,
    DateOnly From,
    DateOnly To,
    DateTimeOffset Now);

/// <param name="CostUnits">What the partner bills for this fetch (accounts fetched), for the spend dashboard.</param>
public sealed record FiFetchResult(FiBundle? Bundle, int CostUnits)
{
    public static readonly FiFetchResult NotReady = new(null, 0);
}

public enum AaCallbackKind
{
    /// <summary>The consent changed state at the AA (approved, rejected, paused, revoked, expired).</summary>
    ConsentStatus,

    /// <summary>The data for an FI request is ready to collect.</summary>
    DataReady,
}

public sealed record AaCallback(AaCallbackKind Kind, string ConsentHandle, ConsentStatus? Status, string? SessionId);

/// <summary>The partner refused or failed. Transient errors are retried by the saga; the rest fail it.</summary>
public sealed class BankDataProviderException : Exception
{
    public BankDataProviderException(string code, bool transient, string message) : base(message)
    {
        Code = code;
        Transient = transient;
    }

    public BankDataProviderException() : this("provider_error", true, "The bank-data provider failed.") { }

    public BankDataProviderException(string message) : this("provider_error", true, message) { }

    public BankDataProviderException(string message, Exception inner) : base(message, inner) => Code = "provider_error";

    /// <summary>A short code safe to store and audit, e.g. <c>provider_unavailable</c>, <c>decrypt_failed</c>.</summary>
    public string Code { get; } = "provider_error";

    public bool Transient { get; } = true;
}
