using Wolverine.Attributes;

namespace Khazana.Messaging.Contracts;

// Identity's events (design doc §8.3). Ids, a platform name and a time only:
// no email, no name, no IP address. A consumer that needs more asks Identity.

/// <summary>A new user signed in for the first time.</summary>
[MessageIdentity("khazana.identity.user-registered.v1")]
public sealed record UserRegisteredV1(Guid UserId, Guid DeviceId, string Platform, DateTimeOffset At);

/// <summary>A user signed in on a device (a new session, not a token refresh).</summary>
[MessageIdentity("khazana.identity.user-signed-in.v1")]
public sealed record UserSignedInV1(Guid UserId, Guid DeviceId, string Platform, DateTimeOffset At);

/// <summary>
/// The user asked for their account to be deleted. Every service that holds
/// their data deletes it once <paramref name="ExecuteAfter"/> passes (the
/// 24-hour cooling-off), and Identity deletes last.
/// </summary>
[MessageIdentity("khazana.identity.account-deletion-requested.v1")]
public sealed record AccountDeletionRequestedV1(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>
/// The account is gone: every service confirmed its purge and Identity deleted
/// the user last. Reporting drops the directory entry; nothing else remains.
/// </summary>
[MessageIdentity("khazana.identity.account-deleted.v1")]
public sealed record AccountDeletedV1(Guid UserId, DateTimeOffset At);
