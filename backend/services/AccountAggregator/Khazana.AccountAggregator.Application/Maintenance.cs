using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Domain;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.AccountAggregator.Application;

/// <summary>Internal, hourly (design doc §8.9): expiries, inbox retention and scheduled fetches.</summary>
public sealed record RunAaMaintenance;

public static class AaMaintenanceHandler
{
    /// <summary>Rows handled per kind per run; the next run picks up the rest.</summary>
    public const int Batch = 200;

    public static async Task Handle(RunAaMaintenance command, AaDbContext db, IMessageContext bus, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var now = clock.UtcNow;

        // Consents past their end date: expired, with everything fetched under them.
        foreach (var consent in await db.Consents
                     .Where(c => (c.Status == ConsentStatus.Active || c.Status == ConsentStatus.Paused || c.Status == ConsentStatus.Pending) && c.ExpiresAt <= now)
                     .Take(Batch).ToListAsync(ct).ConfigureAwait(false))
            await ConsentLifecycle.ApplyAsync(db, bus, consent, ConsentStatus.Expired, now, ct).ConfigureAwait(false);
        // Saved (inside the handler's transaction) so the queries below see the new states.
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        // Requests never approved within 24 hours (§8.5, Requested): dropped, and dropped at the partner.
        var approvalCutoff = now - ConsentRules.ApprovalWindow;
        foreach (var consent in await db.Consents
                     .Where(c => c.Status == ConsentStatus.Pending && c.CreatedAt <= approvalCutoff)
                     .Take(Batch).ToListAsync(ct).ConfigureAwait(false))
        {
            await ConsentLifecycle.ApplyAsync(db, bus, consent, ConsentStatus.Rejected, now, ct).ConfigureAwait(false);
            await bus.PublishAsync(new RevokeAtProvider(consent.Provider, consent.Handle)).ConfigureAwait(false);
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        // Sealed payloads nobody collected in 14 days.
        var expired = await db.InboxPayloads.Where(p => p.ExpiresAt <= now).Select(p => new { p.Id, p.SagaId })
            .Take(Batch).ToListAsync(ct).ConfigureAwait(false);
        if (expired.Count > 0)
        {
            var ids = expired.Select(p => p.Id).ToList();
            var sagas = expired.Where(p => p.SagaId is not null).Select(p => p.SagaId!.Value).ToList();
            await db.InboxPayloads.Where(p => ids.Contains(p.Id)).ExecuteDeleteAsync(ct).ConfigureAwait(false);
            await db.FetchSagas.Where(s => sagas.Contains(s.Id) && s.State == FetchState.Sealed)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, FetchState.Expired).SetProperty(x => x.UpdatedAt, now), ct).ConfigureAwait(false);
        }

        // Scheduled fetches (weekly by default), skipping users inactive 30 days (§8.5).
        var activeSince = now - ConsentRules.InactiveAfter;
        foreach (var consent in await db.Consents
                     .Where(c => c.Status == ConsentStatus.Active && c.ExpiresAt > now && c.NextFetchAt != null && c.NextFetchAt <= now
                                 && c.OwnerSeenAt > activeSince)
                     .OrderBy(c => c.NextFetchAt).Take(Batch).ToListAsync(ct).ConfigureAwait(false))
            await ConsentLifecycle.StartSagaAsync(db, bus, consent, "scheduled", now, ct).ConfigureAwait(false);
    }
}

/// <summary>Deletes everything the AA service holds for a user. Internal: never on the broker.</summary>
/// <param name="ExecuteAfter">The deletion this purge belongs to, so a cancellation of it can be honoured.</param>
public sealed record PurgeUserAa(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>
/// The AA service's part of the account-deletion saga: wait out the
/// cooling-off, then revoke every open consent at the partner (design doc §6,
/// "AA consents are revoked"), delete consents, sagas and sealed payloads,
/// and report back with <see cref="UserDataPurgedV1"/>.
/// </summary>
public static class AccountDeletionHandler
{
    public const string ServiceName = "aa";

    public static async Task Handle(AccountDeletionRequestedV1 message, IMessageContext bus, IClock clock)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var purge = new PurgeUserAa(message.UserId, message.ExecuteAfter);
        if (message.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    /// <summary>
    /// Runs inside Wolverine's transaction. The partner revocations go out as
    /// their own retried messages, so a partner outage can't hold the purge
    /// up. Running twice is harmless; a cancelled deletion deletes nothing.
    /// </summary>
    public static async Task<OutgoingMessages> Handle(
        PurgeUserAa command, AaDbContext db, DeletionCancellations cancellations, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(cancellations);
        ArgumentNullException.ThrowIfNull(clock);
        if (await cancellations.IsCancelledAsync(command.UserId, command.ExecuteAfter, ct).ConfigureAwait(false)) return [];

        var now = clock.UtcNow;
        var outgoing = new OutgoingMessages();
        var open = await db.Consents.AsNoTracking()
            .Where(c => c.UserId == command.UserId && (c.Status == ConsentStatus.Pending || c.Status == ConsentStatus.Active || c.Status == ConsentStatus.Paused))
            .Select(c => new { c.Id, c.Provider, c.Handle }).ToListAsync(ct).ConfigureAwait(false);
        foreach (var consent in open)
        {
            outgoing.Add(new RevokeAtProvider(consent.Provider, consent.Handle));
            outgoing.Add(new ConsentRevokedV1(command.UserId, consent.Id, ConsentRules.Wire(ConsentStatus.Revoked), now));
        }

        // Payloads and sagas cascade from consents; deleted explicitly so nothing depends on the cascade.
        await db.InboxPayloads.Where(p => p.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.FetchSagas.Where(s => s.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Consents.Where(c => c.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        outgoing.Add(new UserDataPurgedV1(command.UserId, ServiceName, now));
        return outgoing;
    }
}
