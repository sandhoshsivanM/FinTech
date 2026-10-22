using Khazana.Devices.Application.Persistence;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.Devices.Application;

/// <summary>Deletes everything Devices & Keys holds for a user. Internal: never on the broker.</summary>
/// <param name="ExecuteAfter">The deletion this purge belongs to, so a cancellation of it can be honoured.</param>
public sealed record PurgeUserDevices(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>
/// Devices & Keys' part of the account-deletion saga: wait out the cooling-off,
/// delete unless the user cancelled, then report back with <see cref="UserDataPurgedV1"/>.
/// </summary>
public static class AccountDeletionHandler
{
    public const string ServiceName = "devices";

    /// <summary>
    /// Schedules the purge on a durable local queue (it survives restarts), or
    /// runs it now if the cooling-off has already passed, e.g. after an outage.
    /// </summary>
    public static async Task Handle(AccountDeletionRequestedV1 message, IMessageContext bus, IClock clock)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var purge = new PurgeUserDevices(message.UserId, message.ExecuteAfter);
        if (message.ExecuteAfter <= clock.UtcNow)
            await bus.PublishAsync(purge).ConfigureAwait(false);
        else
            await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    /// <summary>
    /// Runs inside Wolverine's transaction: the deletes and the outgoing event
    /// commit together. Running twice is harmless (nothing left to delete). A
    /// cancelled deletion deletes nothing and reports nothing.
    /// </summary>
    public static async Task<OutgoingMessages> Handle(
        PurgeUserDevices command, DevicesDbContext db, DeletionCancellations cancellations, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(cancellations);
        ArgumentNullException.ThrowIfNull(clock);
        if (await cancellations.IsCancelledAsync(command.UserId, command.ExecuteAfter, ct).ConfigureAwait(false)) return [];

        var user = command.UserId;
        db.KeyEnvelopes.RemoveRange(await db.KeyEnvelopes.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.KeyChecks.RemoveRange(await db.KeyChecks.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.PairingSessions.RemoveRange(await db.PairingSessions.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.Devices.RemoveRange(await db.Devices.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        return [new UserDataPurgedV1(user, ServiceName, clock.UtcNow)];
    }
}

/// <summary>
/// The device's session ended in Identity (logout, log out everywhere, a reused
/// refresh token): revoke it here too, so its key envelope goes and Sync and
/// Notification stop serving it. Already revoked: nothing to do, nothing announced.
/// </summary>
public static class SessionEndedHandler
{
    public static async Task<OutgoingMessages> Handle(SessionEndedV1 message, DevicesDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var device = await db.Devices.FirstOrDefaultAsync(d => d.Id == message.DeviceId && d.UserId == message.UserId, ct).ConfigureAwait(false);
        if (device is null || device.RevokedAt is not null) return [];

        var now = clock.UtcNow;
        device.RevokedAt = now;
        db.KeyEnvelopes.RemoveRange(await db.KeyEnvelopes.Where(e => e.DeviceId == device.Id).ToListAsync(ct).ConfigureAwait(false));
        foreach (var session in await db.PairingSessions.Where(p => p.NewDeviceId == device.Id && p.CompletedAt == null).ToListAsync(ct).ConfigureAwait(false))
            session.CompletedAt = now;
        return [new DeviceRevokedV1(message.UserId, device.Id, now)];
    }
}
