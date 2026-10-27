using Khazana.Messaging.Contracts;
using Khazana.Notification.Domain;

namespace Khazana.Notification.Application;

/// <summary>
/// Sealed bank data or a credit report is waiting in an inbox (design doc
/// §8.3): every device of the user gets the silent, data-free "time to sync"
/// push, and the app pulls its inboxes along with sync. Nothing in the push
/// says what arrived.
/// </summary>
public static class InboxNudgeHandler
{
    public static Task Handle(PayloadSealedV1 message, PushDispatcher dispatcher, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(dispatcher);
        return dispatcher.SendAsync(message.UserId, null, PushContent.SyncNudge, ct);
    }

    public static Task Handle(CreditReportReadyV1 message, PushDispatcher dispatcher, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(dispatcher);
        return dispatcher.SendAsync(message.UserId, null, PushContent.SyncNudge, ct);
    }
}
