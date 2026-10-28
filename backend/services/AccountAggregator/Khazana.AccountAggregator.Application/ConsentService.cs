using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Domain;
using Khazana.Crypto;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Khazana.AccountAggregator.Application;

public enum AaError
{
    BadRequest,
    NotFound,

    /// <summary>No active, unexpired consent: nothing may be fetched.</summary>
    ConsentInactive,
    Conflict,
    TooMany,
    Unauthorized,
    ProviderUnavailable,
}

/// <summary>A refused request. The message is for logs; clients see only the error code.</summary>
public sealed class AaException : Exception
{
    public AaException(AaError error, string logMessage) : base(logMessage) => Error = error;
    public AaException() : this(AaError.BadRequest, "Refused.") { }
    public AaException(string message) : this(AaError.BadRequest, message) { }
    public AaException(string message, Exception inner) : base(message, inner) => Error = AaError.BadRequest;

    public AaError Error { get; }
}

/// <param name="ValidityDays">How long the consent lasts; defaults to a year.</param>
/// <param name="AaHandle">The user's AA id, passed to the partner and not kept.</param>
public sealed record CreateConsent(
    IReadOnlyList<string>? FiTypes,
    byte[]? DeliveryKey,
    DateOnly? DataFrom = null,
    DateOnly? DataTo = null,
    string? Frequency = null,
    int? ValidityDays = null,
    string? AaHandle = null);

public sealed record ConsentView(
    Guid Id,
    string Status,
    IReadOnlyList<string> FiTypes,
    string Frequency,
    DateOnly DataFrom,
    DateOnly DataTo,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ActivatedAt,
    DateTimeOffset? LastFetchedAt,
    DateTimeOffset? NextFetchAt,
    Uri? RedirectUrl,
    string Provider);

/// <summary>Which partner this deployment runs, so the app knows whether to redirect, ask for a handle, or label sample data.</summary>
public sealed record ProviderView(string Provider, bool Sample, bool NeedsAaHandle, IReadOnlyList<string> FiTypes);

/// <param name="Started">False when an existing fetch was joined or the data is fresh enough.</param>
public sealed record FetchView(Guid? SagaId, string State, bool Started, int Attempt, string? ErrorCode, DateTimeOffset? LastFetchedAt);

public sealed record InboxItem(Guid Id, string Kind, Guid ConsentId, string Alg, byte[] SealedPayload, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

/// <summary>
/// Consents, "fetch now", the sealed inbox, and partner callbacks (design doc
/// §8.2, §8.5). Every fetch passes one gate: an active, unexpired consent of
/// the caller's own.
/// </summary>
public sealed class ConsentService(IDbContextOutbox<AaDbContext> outbox, IBankDataProvider provider, IClock clock)
{
    /// <summary>Open (pending, active or paused) consents per user: enough for every bank, not for abuse.</summary>
    public const int MaxOpenConsents = 20;

    public const int MaxAaHandleLength = ConsentRules.MaxAaHandleLength;

    /// <summary>Payloads per inbox call; the app acks and calls again for the rest.</summary>
    public const int InboxPage = 10;

    private static readonly TimeSpan SeenResolution = TimeSpan.FromHours(1);

    private AaDbContext Db => outbox.DbContext;

    public async Task<ConsentView> CreateAsync(Guid userId, CreateConsent request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        var now = clock.UtcNow;
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var fiTypes = ConsentRules.CleanFiTypes(request.FiTypes) ?? throw new AaException(AaError.BadRequest, "Unknown, duplicate or missing FI types.");
        if (!fiTypes.All(provider.SupportedFiTypes.Contains))
            throw new AaException(AaError.BadRequest, "FI types this partner can't deliver.");
        if (request.DeliveryKey is null || !DeliveryBox.IsValidPublicKey(request.DeliveryKey))
            throw new AaException(AaError.BadRequest, "Delivery key must be 32 non-zero bytes.");
        if (!ConsentRules.TryParseFrequency(request.Frequency, out var frequency))
            throw new AaException(AaError.BadRequest, "Unknown frequency.");
        var validity = request.ValidityDays ?? ConsentRules.DefaultValidityDays;
        if (validity is < 1 or > ConsentRules.MaxValidityDays) throw new AaException(AaError.BadRequest, "Validity out of range.");
        var to = request.DataTo ?? today;
        var from = request.DataFrom ?? today.AddDays(-ConsentRules.DefaultHistoryDays);
        if (!ConsentRules.IsValidRange(from, to, today)) throw new AaException(AaError.BadRequest, "Data range out of bounds.");
        if (request.AaHandle is { } handle && !ConsentRules.IsValidAaHandle(handle))
            throw new AaException(AaError.BadRequest, "AA handle malformed.");
        if (request.AaHandle is null && provider.NeedsAaHandle)
            throw new AaException(AaError.BadRequest, "This partner needs the user's AA handle or mobile number.");

        var open = await Db.Consents.CountAsync(c => c.UserId == userId &&
            (c.Status == ConsentStatus.Pending || c.Status == ConsentStatus.Active || c.Status == ConsentStatus.Paused), ct).ConfigureAwait(false);
        if (open >= MaxOpenConsents) throw new AaException(AaError.TooMany, "Too many open consents.");

        var id = Guid.CreateVersion7();
        var expiresAt = now.AddDays(validity);
        ConsentCreated created;
        try
        {
            created = await provider.CreateConsentAsync(
                new ConsentRequest(id, userId, request.AaHandle, fiTypes, from, to, frequency, expiresAt), ct).ConfigureAwait(false);
        }
        catch (BankDataProviderException e)
        {
            throw new AaException(AaError.ProviderUnavailable, $"Consent creation failed at the partner: {e.Code}");
        }

        var row = new ConsentRow
        {
            Id = id,
            UserId = userId,
            Provider = provider.Name,
            Handle = created.Handle,
            Status = ConsentStatus.Pending,
            FiTypes = fiTypes,
            Frequency = frequency,
            DataFrom = from,
            DataTo = to,
            ExpiresAt = expiresAt,
            DeliveryKey = request.DeliveryKey,
            RedirectUrl = created.RedirectUrl?.ToString(),
            CreatedAt = now,
            UpdatedAt = now,
            OwnerSeenAt = now,
        };
        Db.Consents.Add(row);
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        return View(row);
    }

    public ProviderView Provider() =>
        new(provider.Name, provider.IsSample, provider.NeedsAaHandle, [.. provider.SupportedFiTypes.Order(StringComparer.Ordinal)]);

    public async Task<IReadOnlyList<ConsentView>> ListAsync(Guid userId, CancellationToken ct)
    {
        await TouchAsync(userId, ct).ConfigureAwait(false);
        var rows = await Db.Consents.AsNoTracking().Where(c => c.UserId == userId)
            .OrderByDescending(c => c.CreatedAt).ToListAsync(ct).ConfigureAwait(false);
        return [.. rows.Select(View)];
    }

    /// <summary>One consent. A pending one is checked with the partner, for apps that return from approval before the callback lands.</summary>
    public async Task<ConsentView> GetAsync(Guid userId, Guid consentId, CancellationToken ct)
    {
        var consent = await OwnAsync(userId, consentId, ct).ConfigureAwait(false);
        if (consent.Status is ConsentStatus.Pending && consent.Provider == provider.Name)
        {
            ConsentStatus status;
            try
            {
                status = await provider.GetConsentStatusAsync(consent.Handle, ct).ConfigureAwait(false);
            }
            catch (BankDataProviderException)
            {
                return View(consent);
            }
            await ApplyAndSaveAsync(consent, status, ct).ConfigureAwait(false);
        }
        return View(consent);
    }

    /// <summary>
    /// The user revokes. Payloads go at once, fetches stop, the partner is told
    /// (retried until it hears). Revoking an ended consent is a no-op.
    /// </summary>
    public async Task RevokeAsync(Guid userId, Guid consentId, CancellationToken ct)
    {
        var consent = await OwnAsync(userId, consentId, ct).ConfigureAwait(false);
        if (ConsentLifecycle.IsEnded(consent.Status)) return;
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        await ConsentLifecycle.ApplyAsync(Db, outbox, consent, ConsentStatus.Revoked, clock.UtcNow, ct).ConfigureAwait(false);
        await outbox.PublishAsync(new RevokeAtProvider(consent.Provider, consent.Handle)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
    }

    /// <summary>
    /// "Fetch now" on app open (§8.5): joins a fetch in flight, skips when the
    /// last one is under a day old, refuses without an active consent.
    /// </summary>
    public async Task<FetchView> FetchNowAsync(Guid userId, Guid consentId, CancellationToken ct)
    {
        var consent = await OwnAsync(userId, consentId, ct).ConfigureAwait(false);
        var now = clock.UtcNow;
        await TouchAsync(userId, ct).ConfigureAwait(false);
        if (!ConsentRules.AllowsFetch(consent.Status, consent.ExpiresAt, now))
            throw new AaException(AaError.ConsentInactive, $"Consent {consent.Id} is {consent.Status}; no fetch.");

        var inFlight = await Db.FetchSagas.AsNoTracking().FirstOrDefaultAsync(
            s => s.ConsentId == consent.Id && (s.State == FetchState.Requested || s.State == FetchState.Fetching), ct).ConfigureAwait(false);
        if (inFlight is not null) return SagaView(inFlight, started: false, consent.LastFetchedAt);
        if (consent.LastFetchedAt is { } last && now - last < ConsentRules.OnOpenMinAge)
            return new FetchView(null, "fresh", false, 0, null, last);

        var saga = await ConsentLifecycle.StartSagaAsync(Db, outbox, consent, "on_open", now, ct).ConfigureAwait(false);
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two "fetch now" at once: the one-in-flight index let the other win. Join it.
            Db.ChangeTracker.Clear();
            var winner = await Db.FetchSagas.AsNoTracking().FirstAsync(
                s => s.ConsentId == consent.Id && (s.State == FetchState.Requested || s.State == FetchState.Fetching), ct).ConfigureAwait(false);
            return SagaView(winner, started: false, consent.LastFetchedAt);
        }
        return SagaView(saga, started: true, consent.LastFetchedAt);
    }

    public async Task<FetchView> FetchStatusAsync(Guid userId, Guid sagaId, CancellationToken ct)
    {
        var saga = await Db.FetchSagas.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sagaId && s.UserId == userId, ct).ConfigureAwait(false)
            ?? throw new AaException(AaError.NotFound, "No such fetch for this user.");
        var last = await Db.Consents.Where(c => c.Id == saga.ConsentId).Select(c => c.LastFetchedAt).SingleAsync(ct).ConfigureAwait(false);
        return SagaView(saga, started: false, last);
    }

    /// <summary>Sealed payloads waiting for the app, oldest first. Only the user's devices can open them.</summary>
    public async Task<IReadOnlyList<InboxItem>> InboxAsync(Guid userId, CancellationToken ct)
    {
        await TouchAsync(userId, ct).ConfigureAwait(false);
        var now = clock.UtcNow;
        return await Db.InboxPayloads.AsNoTracking()
            .Where(p => p.UserId == userId && p.ExpiresAt > now)
            .OrderBy(p => p.CreatedAt)
            .Take(InboxPage)
            .Select(p => new InboxItem(p.Id, p.Kind, p.ConsentId, p.Alg, p.SealedPayload, p.CreatedAt, p.ExpiresAt))
            .ToListAsync(ct).ConfigureAwait(false);
    }

    /// <summary>The app imported a payload: delete it (§8.5, Delivered).</summary>
    public async Task AckAsync(Guid userId, Guid payloadId, CancellationToken ct)
    {
        var payload = await Db.InboxPayloads.Where(p => p.Id == payloadId && p.UserId == userId)
            .Select(p => new { p.Id, p.SagaId }).FirstOrDefaultAsync(ct).ConfigureAwait(false)
            ?? throw new AaException(AaError.NotFound, "No such payload for this user.");
        var now = clock.UtcNow;
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        await Db.InboxPayloads.Where(p => p.Id == payload.Id).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        if (payload.SagaId is { } sagaId)
            await Db.FetchSagas.Where(s => s.Id == sagaId && s.State == FetchState.Sealed)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, FetchState.Delivered).SetProperty(x => x.UpdatedAt, now), ct).ConfigureAwait(false);
        await tx.CommitAsync(ct).ConfigureAwait(false);
    }

    /// <summary>
    /// A partner callback. Unsigned, stale or malformed: refused, nothing
    /// done. For an unknown consent or session: accepted and ignored, so the
    /// endpoint tells a prober nothing.
    /// </summary>
    public async Task HandleCallbackAsync(byte[] body, Func<string, string?> header, CancellationToken ct)
    {
        var callback = provider.VerifyCallback(body, header, clock.UtcNow)
            ?? throw new AaException(AaError.Unauthorized, "Partner callback failed verification.");
        var consent = await Db.Consents.FirstOrDefaultAsync(c => c.Provider == provider.Name && c.Handle == callback.ConsentHandle, ct).ConfigureAwait(false);
        if (consent is null) return;

        switch (callback.Kind)
        {
            case AaCallbackKind.ConsentStatus when callback.Status is { } status:
                await ApplyAndSaveAsync(consent, status, ct).ConfigureAwait(false);
                break;
            case AaCallbackKind.ConsentStatus when consent.Provider == provider.Name:
                // An unsigned hint: believe only what the partner's authenticated API says.
                ConsentStatus current;
                try
                {
                    current = await provider.GetConsentStatusAsync(consent.Handle, ct).ConfigureAwait(false);
                }
                catch (BankDataProviderException)
                {
                    return;
                }
                await ApplyAndSaveAsync(consent, current, ct).ConfigureAwait(false);
                break;
            case AaCallbackKind.DataReady when callback.SessionId is { } session:
                var saga = await Db.FetchSagas.AsNoTracking().FirstOrDefaultAsync(
                    s => s.ConsentId == consent.Id && s.SessionId == session && s.State == FetchState.Fetching, ct).ConfigureAwait(false);
                if (saga is null) return;
                await outbox.PublishAsync(new CollectFiData(saga.Id)).ConfigureAwait(false);
                await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
                break;
        }
    }

    private async Task ApplyAndSaveAsync(ConsentRow consent, ConsentStatus status, CancellationToken ct)
    {
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        if (await ConsentLifecycle.ApplyAsync(Db, outbox, consent, status, clock.UtcNow, ct).ConfigureAwait(false))
            await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
    }

    private async Task<ConsentRow> OwnAsync(Guid userId, Guid consentId, CancellationToken ct) =>
        await Db.Consents.FirstOrDefaultAsync(c => c.Id == consentId && c.UserId == userId, ct).ConfigureAwait(false)
            ?? throw new AaException(AaError.NotFound, "No such consent for this user.");

    /// <summary>Activity for the 30-day rule; at most one write per user per hour.</summary>
    private async Task TouchAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var stale = now - SeenResolution;
        await Db.Consents.Where(c => c.UserId == userId && c.OwnerSeenAt < stale)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.OwnerSeenAt, now), ct).ConfigureAwait(false);
    }

    private static ConsentView View(ConsentRow c) => new(
        c.Id, ConsentRules.Wire(c.Status), c.FiTypes, ConsentRules.Wire(c.Frequency), c.DataFrom, c.DataTo, c.ExpiresAt,
        c.CreatedAt, c.ActivatedAt, c.LastFetchedAt, c.NextFetchAt,
        c.Status == ConsentStatus.Pending && c.RedirectUrl is not null ? new Uri(c.RedirectUrl) : null,
        c.Provider);

    private static FetchView SagaView(FetchSagaRow s, bool started, DateTimeOffset? lastFetchedAt) =>
        new(s.Id, FetchSagaRules.Wire(s.State), started, s.Attempt, s.ErrorCode, lastFetchedAt);
}
