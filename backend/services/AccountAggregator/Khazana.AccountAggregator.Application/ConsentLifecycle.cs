using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Domain;
using Khazana.Messaging.Contracts;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.AccountAggregator.Application;

/// <summary>Internal: ask the saga to make the FI request. Never on the broker.</summary>
public sealed record RequestFiData(Guid SagaId);

/// <summary>Internal: collect, decrypt, normalise and seal the data for a saga.</summary>
public sealed record CollectFiData(Guid SagaId);

/// <summary>Internal: revoke a consent at the partner. Retried with backoff until it succeeds.</summary>
public sealed record RevokeAtProvider(string Provider, string Handle);

/// <summary>
/// Every consent state change goes through here, whoever caused it (the
/// user, the partner's callback, a status poll, expiry, account deletion), so
/// the rules hold in one place: activation starts the first fetch; any end
/// deletes the consent's payloads, stops its fetches and is announced.
/// </summary>
public static class ConsentLifecycle
{
    /// <param name="bus">The outbox (HTTP) or the handler's message context: events commit with the change.</param>
    /// <returns>True when the status changed.</returns>
    public static async Task<bool> ApplyAsync(
        AaDbContext db, IMessageBus bus, ConsentRow consent, ConsentStatus next, DateTimeOffset now, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(consent);
        if (consent.Status == next || IsEnded(consent.Status)) return false;

        // An approval that arrives after the consent's own expiry is an expiry.
        if (next == ConsentStatus.Active && consent.ExpiresAt <= now) next = ConsentStatus.Expired;

        var previous = consent.Status;
        consent.Status = next;
        consent.UpdatedAt = now;

        switch (next)
        {
            case ConsentStatus.Active:
                consent.ActivatedAt ??= now;
                await bus.PublishAsync(new ConsentActivatedV1(consent.UserId, consent.Id, ConsentRules.Wire(next), now)).ConfigureAwait(false);
                // First approval: fetch at once. Resuming from a pause: the schedule decides.
                if (previous == ConsentStatus.Pending)
                    await StartSagaAsync(db, bus, consent, "first", now, ct).ConfigureAwait(false);
                else
                    consent.NextFetchAt ??= now;
                break;

            case ConsentStatus.Paused:
                await StopFetchesAsync(db, consent.Id, "consent_paused", now, ct).ConfigureAwait(false);
                await bus.PublishAsync(new ConsentRevokedV1(consent.UserId, consent.Id, ConsentRules.Wire(next), now)).ConfigureAwait(false);
                break;

            case ConsentStatus.Pending:
                break;

            default:
                // Revoked, expired or rejected: nothing fetched under it may outlive it.
                consent.EndedAt = now;
                consent.NextFetchAt = null;
                await StopFetchesAsync(db, consent.Id, "consent_ended", now, ct).ConfigureAwait(false);
                await db.InboxPayloads.Where(p => p.ConsentId == consent.Id).ExecuteDeleteAsync(ct).ConfigureAwait(false);
                await bus.PublishAsync(new ConsentRevokedV1(consent.UserId, consent.Id, ConsentRules.Wire(next), now)).ConfigureAwait(false);
                break;
        }
        return true;
    }

    public static bool IsEnded(ConsentStatus status) =>
        status is ConsentStatus.Revoked or ConsentStatus.Expired or ConsentStatus.Rejected;

    /// <summary>
    /// Starts a fetch saga for a consent that allows one. Returns the saga
    /// already in flight instead, if there is one.
    /// </summary>
    public static async Task<FetchSagaRow> StartSagaAsync(
        AaDbContext db, IMessageBus bus, ConsentRow consent, string trigger, DateTimeOffset now, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(consent);
        var inFlight = await db.FetchSagas.FirstOrDefaultAsync(
            s => s.ConsentId == consent.Id && (s.State == FetchState.Requested || s.State == FetchState.Fetching), ct).ConfigureAwait(false);
        if (inFlight is not null) return inFlight;

        // A first fetch takes the whole consented window; later ones, the days since the last.
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var to = consent.DataTo < today ? consent.DataTo : today;
        var from = consent.LastFetchedAt is { } last && trigger != "first"
            ? Max(consent.DataFrom, DateOnly.FromDateTime(last.UtcDateTime).AddDays(-1))
            : consent.DataFrom;
        if (from > to) from = to;

        var saga = new FetchSagaRow
        {
            Id = Guid.CreateVersion7(),
            ConsentId = consent.Id,
            UserId = consent.UserId,
            State = FetchState.Requested,
            Trigger = trigger,
            DataFrom = from,
            DataTo = to,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.FetchSagas.Add(saga);
        consent.NextFetchAt = now + ConsentRules.Interval(consent.Frequency);
        await bus.PublishAsync(new RequestFiData(saga.Id)).ConfigureAwait(false);
        return saga;
    }

    private static async Task StopFetchesAsync(AaDbContext db, Guid consentId, string reason, DateTimeOffset now, CancellationToken ct)
    {
        foreach (var saga in await db.FetchSagas
                     .Where(s => s.ConsentId == consentId && (s.State == FetchState.Requested || s.State == FetchState.Fetching))
                     .ToListAsync(ct).ConfigureAwait(false))
        {
            saga.State = FetchState.Failed;
            saga.ErrorCode = reason;
            saga.UpdatedAt = now;
        }
        // Sealed but not yet collected: the saga ends with its payload (deleted by the caller on an end).
        foreach (var saga in await db.FetchSagas
                     .Where(s => s.ConsentId == consentId && s.State == FetchState.Sealed)
                     .ToListAsync(ct).ConfigureAwait(false))
        {
            if (reason == "consent_ended")
            {
                saga.State = FetchState.Expired;
                saga.UpdatedAt = now;
            }
        }
    }

    private static DateOnly Max(DateOnly a, DateOnly b) => a > b ? a : b;
}
