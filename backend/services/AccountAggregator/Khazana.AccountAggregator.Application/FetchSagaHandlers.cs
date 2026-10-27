using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Domain;
using Khazana.Crypto;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Khazana.AccountAggregator.Application;

/// <summary>
/// The fetch saga's steps (design doc §8.5). Each runs in Wolverine's
/// transaction: the saga row is locked first, so a partner callback and the
/// fallback poll can't both seal the same fetch, and every outgoing message
/// (the next step, a retry, an event) commits with the state it follows from.
/// </summary>
/// <remarks>
/// Every step re-checks the consent. A consent revoked between the request
/// and the data arriving stops the saga before anything is collected.
/// </remarks>
public static partial class FetchSagaHandler
{
    /// <summary>Bigger than any sane fetch; the S3 inbox for larger ones is not built yet.</summary>
    public const int MaxSealedBytes = 8 * 1024 * 1024;

    public static async Task Handle(
        RequestFiData command, AaDbContext db, IBankDataProvider provider, IMessageContext bus, IClock clock,
        ILogger<RequestFiData> log, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(provider);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);

        var saga = await LockAsync(db, command.SagaId, ct).ConfigureAwait(false);
        if (saga is null || saga.State != FetchState.Requested) return;
        var now = clock.UtcNow;
        var consent = await db.Consents.SingleAsync(c => c.Id == saga.ConsentId, ct).ConfigureAwait(false);
        if (!ConsentRules.AllowsFetch(consent.Status, consent.ExpiresAt, now))
        {
            await FailAsync(saga, bus, "consent_inactive", now).ConfigureAwait(false);
            return;
        }

        try
        {
            var started = await provider.RequestFiDataAsync(consent.Handle, saga.DataFrom, saga.DataTo, ct).ConfigureAwait(false);
            saga.SessionId = started.SessionId;
            saga.State = FetchState.Fetching;
            saga.RequestedAt = now;
            saga.UpdatedAt = now;
            if (started.DataReady) await bus.PublishAsync(new CollectFiData(saga.Id)).ConfigureAwait(false);
            else await bus.ScheduleAsync(new CollectFiData(saga.Id), now + ConsentRules.PollInterval).ConfigureAwait(false);
        }
        catch (BankDataProviderException e)
        {
            StepFailed(log, saga.Id, e.Code);
            await RetryOrFailAsync(saga, bus, e, new RequestFiData(saga.Id), now).ConfigureAwait(false);
        }
    }

    public static async Task Handle(
        CollectFiData command, AaDbContext db, IBankDataProvider provider, IMessageContext bus, IClock clock,
        ILogger<CollectFiData> log, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(provider);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);

        var saga = await LockAsync(db, command.SagaId, ct).ConfigureAwait(false);
        if (saga is null || saga.State != FetchState.Fetching) return;
        var now = clock.UtcNow;
        var consent = await db.Consents.SingleAsync(c => c.Id == saga.ConsentId, ct).ConfigureAwait(false);
        if (!ConsentRules.AllowsFetch(consent.Status, consent.ExpiresAt, now))
        {
            await FailAsync(saga, bus, "consent_inactive", now).ConfigureAwait(false);
            return;
        }

        byte[] sealedPayload;
        var payloadId = Guid.CreateVersion7();
        int costUnits;
        try
        {
            var result = await provider.FetchFiDataAsync(new FiFetchContext(
                consent.Id, consent.Handle, saga.SessionId!, consent.FiTypes, saga.DataFrom, saga.DataTo, now), ct).ConfigureAwait(false);
            if (result.Bundle is null)
            {
                if (now - (saga.RequestedAt ?? now) >= ConsentRules.FetchTimeout)
                    await FailAsync(saga, bus, "timeout", now).ConfigureAwait(false);
                else
                    await bus.ScheduleAsync(new CollectFiData(saga.Id), now + ConsentRules.PollInterval).ConfigureAwait(false);
                return;
            }
            // The only moment bank data is readable on the server: sealed at
            // once, the serialised plaintext wiped inside Seal, the object
            // graph dropped with this scope.
            sealedPayload = SealedEnvelope.Seal(consent.DeliveryKey, payloadId, FiBundle.Kind, result.Bundle);
            costUnits = result.CostUnits;
        }
        catch (BankDataProviderException e)
        {
            StepFailed(log, saga.Id, e.Code);
            await RetryOrFailAsync(saga, bus, e, new CollectFiData(saga.Id), now).ConfigureAwait(false);
            return;
        }
        catch (ArgumentException)
        {
            // The stored delivery key can't be sealed to: never retry, never store plaintext.
            await FailAsync(saga, bus, "delivery_key_invalid", now).ConfigureAwait(false);
            return;
        }

        if (sealedPayload.Length > MaxSealedBytes)
        {
            await FailAsync(saga, bus, "too_large", now).ConfigureAwait(false);
            return;
        }

        db.InboxPayloads.Add(new InboxPayloadRow
        {
            Id = payloadId,
            UserId = saga.UserId,
            ConsentId = consent.Id,
            SagaId = saga.Id,
            Kind = FiBundle.Kind,
            Alg = DeliveryBox.Alg,
            SealedPayload = sealedPayload,
            CreatedAt = now,
            ExpiresAt = now + ConsentRules.InboxRetention,
        });
        saga.State = FetchState.Sealed;
        saga.CostUnits += costUnits;
        saga.NextRetryAt = null;
        saga.ErrorCode = null;
        saga.UpdatedAt = now;
        consent.LastFetchedAt = now;
        consent.NextFetchAt = now + ConsentRules.Interval(consent.Frequency);
        consent.UpdatedAt = now;
        await bus.PublishAsync(new PayloadSealedV1(saga.UserId, payloadId, FiBundle.Kind, now)).ConfigureAwait(false);
    }

    /// <summary>Retries with backoff while the error is transient and attempts remain; otherwise fails (§8.5).</summary>
    private static async Task RetryOrFailAsync(FetchSagaRow saga, IMessageContext bus, BankDataProviderException e, object retry, DateTimeOffset now)
    {
        saga.Attempt++;
        saga.ErrorCode = e.Code;
        saga.UpdatedAt = now;
        if (!e.Transient || saga.Attempt >= FetchSagaRules.MaxAttempts)
        {
            await FailAsync(saga, bus, e.Code, now).ConfigureAwait(false);
            return;
        }
        saga.NextRetryAt = now + FetchSagaRules.RetryDelay(saga.Attempt);
        await bus.ScheduleAsync(retry, saga.NextRetryAt.Value).ConfigureAwait(false);
    }

    private static async Task FailAsync(FetchSagaRow saga, IMessageContext bus, string code, DateTimeOffset now)
    {
        saga.State = FetchState.Failed;
        saga.ErrorCode = code;
        saga.NextRetryAt = null;
        saga.UpdatedAt = now;
        await bus.PublishAsync(new AaFetchFailedV1(saga.UserId, saga.ConsentId, code, now)).ConfigureAwait(false);
    }

    private static async Task<FetchSagaRow?> LockAsync(AaDbContext db, Guid sagaId, CancellationToken ct) =>
        (await db.FetchSagas.FromSql($"SELECT * FROM aa.aa_fetch_sagas WHERE id = {sagaId} FOR UPDATE")
            .ToListAsync(ct).ConfigureAwait(false)).SingleOrDefault();

    [LoggerMessage(Level = LogLevel.Warning, Message = "AA fetch saga {SagaId} step failed: {Code}")]
    private static partial void StepFailed(ILogger logger, Guid sagaId, string code);
}

/// <summary>Revokes at the partner after the consent ended here. Failures throw, and Wolverine retries with backoff.</summary>
public static partial class RevokeAtProviderHandler
{
    public static async Task Handle(RevokeAtProvider command, IBankDataProvider provider, ILogger<RevokeAtProvider> log, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(provider);
        if (!string.Equals(command.Provider, provider.Name, StringComparison.Ordinal))
        {
            // Made by an adapter this deployment no longer runs: nothing here can reach it.
            OtherProvider(log, command.Provider);
            return;
        }
        await provider.RevokeConsentAsync(command.Handle, ct).ConfigureAwait(false);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Consent from provider {Provider} can't be revoked by this deployment's adapter.")]
    private static partial void OtherProvider(ILogger logger, string provider);
}
