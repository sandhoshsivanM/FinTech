using Wolverine.Attributes;

namespace Khazana.Messaging.Contracts;

// Devices & Keys events (design doc §8.3). Ids, a platform name and a time:
// never a device name, a key or an envelope.

/// <summary>A device registered its public key for the first time.</summary>
[MessageIdentity("khazana.devices.device-added.v1")]
public sealed record DeviceAddedV1(Guid UserId, Guid DeviceId, string Platform, DateTimeOffset At);

/// <summary>
/// A device was logged out remotely. Identity ends its sessions; Sync stops
/// serving it; its key envelope is already deleted.
/// </summary>
[MessageIdentity("khazana.devices.device-revoked.v1")]
public sealed record DeviceRevokedV1(Guid UserId, Guid DeviceId, DateTimeOffset At);

/// <summary>
/// A service finished deleting a user's data after <see cref="AccountDeletionRequestedV1"/>.
/// Identity collects these and deletes the user last (the deletion saga).
/// </summary>
[MessageIdentity("khazana.account.user-data-purged.v1")]
public sealed record UserDataPurgedV1(Guid UserId, string Service, DateTimeOffset At);
