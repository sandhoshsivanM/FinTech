using Khazana.Devices.Application.Persistence;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.Devices.Application;

/// <summary>Deletes everything Devices & Keys holds for a user. Internal: never on the broker.</summary>
public sealed record PurgeUserDevices(Guid UserId);

/// <summary>
/// Devices & Keys' part of the account-deletion saga: wait out the cooling-off,
/// delete, then report back with <see cref="UserDataPurgedV1"/>.
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
        var purge = new PurgeUserDevices(message.UserId);
        if (message.ExecuteAfter <= clock.UtcNow)
            await bus.PublishAsync(purge).ConfigureAwait(false);
        else
            await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    /// <summary>
    /// Runs inside Wolverine's transaction: the deletes and the outgoing event
    /// commit together. Running twice is harmless (nothing left to delete).
    /// </summary>
    public static async Task<UserDataPurgedV1> Handle(PurgeUserDevices command, DevicesDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var user = command.UserId;
        db.KeyEnvelopes.RemoveRange(await db.KeyEnvelopes.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.KeyChecks.RemoveRange(await db.KeyChecks.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.PairingSessions.RemoveRange(await db.PairingSessions.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        db.Devices.RemoveRange(await db.Devices.Where(x => x.UserId == user).ToListAsync(ct).ConfigureAwait(false));
        return new UserDataPurgedV1(user, ServiceName, clock.UtcNow);
    }
}
