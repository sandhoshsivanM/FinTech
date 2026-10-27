using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;

namespace Khazana.AccountAggregator.Infrastructure;

/// <summary>
/// TODO(P4, design doc §13.3): the Finvu sandbox adapter, then Finvu or Setu
/// production through a regulated FIU partner (decision D4). Not built:
/// selecting it stops startup. No network call exists here yet.
/// </summary>
/// <remarks>
/// What it has to do when built:
/// <list type="bullet">
/// <item>Consent: POST the ReBIT consent request (purpose, FI types, data
///   range, frequency, data life) and return the consent handle plus the
///   redirect for the AA's approval screen.</item>
/// <item>Callbacks: verify the partner's detached JWS signature against its
///   published key and the timestamp window; map consent and FI notifications
///   to <see cref="AaCallback"/>.</item>
/// <item>FI data: FI request with the FIU's ephemeral ECDH key (Curve25519, the
///   ReBIT encryption spec), then FI fetch; decrypt in memory with the FIU key
///   held in KMS; normalise the XML/JSON per FI type into <see cref="FiBundle"/>.</item>
/// <item>Errors: timeouts and 5xx as transient <see cref="BankDataProviderException"/>;
///   decrypt and schema errors as non-transient (<c>decrypt_failed</c>).</item>
/// <item>One contract-test suite runs against it and the sample adapter (ADR 0003).</item>
/// </list>
/// </remarks>
public sealed class FinvuBankDataProvider : IBankDataProvider
{
    public const string ProviderName = "finvu";

    public string Name => ProviderName;

    public Task<ConsentCreated> CreateConsentAsync(ConsentRequest request, CancellationToken ct) => throw NotBuilt();

    public Task<ConsentStatus> GetConsentStatusAsync(string consentHandle, CancellationToken ct) => throw NotBuilt();

    public Task RevokeConsentAsync(string consentHandle, CancellationToken ct) => throw NotBuilt();

    public Task<FiRequestStarted> RequestFiDataAsync(string consentHandle, DateOnly dataFrom, DateOnly dataTo, CancellationToken ct) => throw NotBuilt();

    public Task<FiFetchResult> FetchFiDataAsync(FiFetchContext context, CancellationToken ct) => throw NotBuilt();

    public AaCallback? VerifyCallback(byte[] body, Func<string, string?> header, DateTimeOffset now) => throw NotBuilt();

    private static NotSupportedException NotBuilt() => new("The Finvu adapter is not built yet (TODO P4).");
}
