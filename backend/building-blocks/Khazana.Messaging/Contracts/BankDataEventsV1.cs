using Wolverine.Attributes;

namespace Khazana.Messaging.Contracts;

// Account Aggregator and Credit events (design doc §8.3). Ids, a status word
// and a time: never an amount, an account, a score, a bank name or a PAN.

/// <summary>The user approved a consent at their Account Aggregator; scheduled fetches may run.</summary>
/// <param name="Status">Always <c>active</c> today; kept so the shape matches <see cref="ConsentRevokedV1"/>.</param>
[MessageIdentity("khazana.aa.consent-activated.v1")]
public sealed record ConsentActivatedV1(Guid UserId, Guid ConsentId, string Status, DateTimeOffset At);

/// <summary>
/// A consent ended: revoked by the user (here or at their AA), expired,
/// rejected or never approved, or ended by account deletion. Every payload
/// fetched under it is already deleted.
/// </summary>
/// <param name="Status"><c>revoked</c>, <c>expired</c>, <c>rejected</c> or <c>paused</c>.</param>
[MessageIdentity("khazana.aa.consent-revoked.v1")]
public sealed record ConsentRevokedV1(Guid UserId, Guid ConsentId, string Status, DateTimeOffset At);

/// <summary>
/// Bank data was sealed to the user's delivery key and is waiting in the AA
/// inbox. Notification sends a data-free nudge; the app pulls and acks it.
/// </summary>
/// <param name="Kind">The payload format, e.g. <c>aa.fi-bundle.v1</c>.</param>
[MessageIdentity("khazana.aa.payload-sealed.v1")]
public sealed record PayloadSealedV1(Guid UserId, Guid PayloadId, string Kind, DateTimeOffset At);

/// <summary>A fetch gave up (retries spent, decrypt error, consent gone). Reporting audits it; no data is involved.</summary>
/// <param name="ErrorCode">A short code such as <c>provider_unavailable</c> or <c>decrypt_failed</c>.</param>
[MessageIdentity("khazana.aa.fetch-failed.v1")]
public sealed record AaFetchFailedV1(Guid UserId, Guid ConsentId, string ErrorCode, DateTimeOffset At);

/// <summary>A credit report was pulled with the user's explicit consent, sealed to their key and put in the Credit inbox.</summary>
[MessageIdentity("khazana.credit.credit-report-ready.v1")]
public sealed record CreditReportReadyV1(Guid UserId, Guid PayloadId, DateTimeOffset At);

/// <summary>The user withdrew their credit-report consent: every undelivered report is deleted. A new pull needs a fresh consent anyway.</summary>
[MessageIdentity("khazana.credit.credit-consent-withdrawn.v1")]
public sealed record CreditConsentWithdrawnV1(Guid UserId, DateTimeOffset At);
