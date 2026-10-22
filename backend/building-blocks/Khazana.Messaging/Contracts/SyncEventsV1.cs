using Wolverine.Attributes;

namespace Khazana.Messaging.Contracts;

/// <summary>
/// A device pushed records. Notification sends the user's other devices a
/// data-free "time to sync" push. Ids and a sequence number only: never a
/// record, a collection name or a count of anything.
/// </summary>
[MessageIdentity("khazana.sync.records-pushed.v1")]
public sealed record RecordsPushedV1(Guid UserId, Guid FromDeviceId, long Seq);
