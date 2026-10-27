using System.Text;
using Khazana.Credit.Application.Persistence;
using Khazana.Credit.Domain;
using Khazana.Crypto;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

namespace Khazana.Credit.Application;

public enum CreditError
{
    BadRequest,
    NotFound,

    /// <summary>No explicit consent with a current consent text: no pull.</summary>
    ConsentRequired,

    /// <summary>The last successful pull is under 30 days old.</summary>
    TooSoon,

    /// <summary>A pull for this user is already running.</summary>
    InProgress,
    ProviderUnavailable,
}

/// <summary>A refused request. The message is for logs (never a PAN or mobile); clients see only the error code.</summary>
public sealed class CreditException : Exception
{
    public CreditException(CreditError error, string logMessage, DateTimeOffset? nextAllowedAt = null) : base(logMessage)
    {
        Error = error;
        NextAllowedAt = nextAllowedAt;
    }

    public CreditException() : this(CreditError.BadRequest, "Refused.") { }
    public CreditException(string message) : this(CreditError.BadRequest, message) { }
    public CreditException(string message, Exception inner) : base(message, inner) => Error = CreditError.BadRequest;

    public CreditError Error { get; }

    public DateTimeOffset? NextAllowedAt { get; }
}

/// <summary>Consent texts the app may show; a pull must name one of them (§8.6, "the consent text version is stored").</summary>
public sealed record CreditSettings(IReadOnlyList<string> ConsentTextVersions)
{
    public const string DefaultVersion = "credit-consent-v1";
}

/// <param name="ConsentAccepted">The user ticked the consent the app showed; anything but true is refused.</param>
public sealed record PullRequest(
    string? ConsentTextVersion,
    bool ConsentAccepted,
    string? Pan,
    string? Mobile,
    byte[]? DeliveryKey,
    string? FullName = null)
{
    // Records print every member; this one carries a PAN and a mobile number.
    private bool PrintMembers(StringBuilder builder)
    {
        builder.Append("ConsentTextVersion = ").Append(ConsentTextVersion).Append(", ConsentAccepted = ").Append(ConsentAccepted)
            .Append(", Pan = ***, Mobile = ***");
        return true;
    }
}

public sealed record PullView(Guid PullId, Guid? PayloadId, string Status, string Provider, string ConsentTextVersion,
    DateTimeOffset RequestedAt, DateTimeOffset? CompletedAt, string? ErrorCode);

public sealed record PullResult(Guid PullId, Guid PayloadId, string Status, DateTimeOffset RequestedAt, DateTimeOffset NextAllowedAt);

public sealed record PullHistory(IReadOnlyList<PullView> Pulls, DateTimeOffset? NextAllowedAt);

public sealed record InboxItem(Guid Id, string Kind, Guid PullId, string Alg, byte[] SealedPayload, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

/// <summary>
/// Credit-report pulls with explicit consent (design doc §8.6). The report is
/// sealed to the user's delivery key before it is stored; PAN and mobile go
/// to the bureau call and nowhere else. Offers are matched on the device
/// against the signed Catalog: nothing here looks at the report's contents.
/// </summary>
public sealed class CreditService(
    IDbContextOutbox<CreditDbContext> outbox, ICreditReportProvider provider, CreditSettings settings, IClock clock)
{
    public const int InboxPage = 10;

    private CreditDbContext Db => outbox.DbContext;

    public async Task<PullResult> PullAsync(Guid userId, PullRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!request.ConsentAccepted || request.ConsentTextVersion is null ||
            !settings.ConsentTextVersions.Contains(request.ConsentTextVersion, StringComparer.Ordinal))
            throw new CreditException(CreditError.ConsentRequired, "Pull without an accepted, current consent text.");
        var pan = request.Pan?.Trim().ToUpperInvariant();
        var mobile = request.Mobile?.Trim();
        if (!CreditRules.IsValidPan(pan) || !CreditRules.IsValidMobile(mobile) || !CreditRules.IsValidName(request.FullName))
            throw new CreditException(CreditError.BadRequest, "PAN, mobile or name malformed.");
        if (request.DeliveryKey is null || !DeliveryBox.IsValidPublicKey(request.DeliveryKey))
            throw new CreditException(CreditError.BadRequest, "Delivery key must be 32 non-zero bytes.");

        var now = clock.UtcNow;
        var next = CreditRules.NextAllowedAt(await LastSuccessAsync(userId, ct).ConfigureAwait(false));
        if (next > now) throw new CreditException(CreditError.TooSoon, "Pulled within the last 30 days.", next);

        // Claim the one in-progress slot first: two taps can't buy two reports.
        var pull = new CreditPullRow
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Provider = provider.Name,
            Status = PullStatus.InProgress,
            ConsentTextVersion = request.ConsentTextVersion,
            Purpose = CreditRules.Purpose,
            RequestedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        Db.Pulls.Add(pull);
        try
        {
            await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            throw new CreditException(CreditError.InProgress, "A pull is already running for this user.");
        }

        var payloadId = Guid.CreateVersion7();
        byte[] sealedReport;
        try
        {
            var report = await provider.FetchReportAsync(
                new CreditReportRequest(pull.Id, pan!, mobile!, request.FullName, request.ConsentTextVersion, CreditRules.Purpose, now), ct).ConfigureAwait(false);
            sealedReport = SealedEnvelope.Seal(request.DeliveryKey, payloadId, CreditReport.Kind, report);
        }
        catch (CreditProviderException e)
        {
            await FinishAsync(pull, PullStatus.Failed, e.Code, ct).ConfigureAwait(false);
            throw new CreditException(CreditError.ProviderUnavailable, $"Bureau pull failed: {e.Code}");
        }
        catch (ArgumentException)
        {
            await FinishAsync(pull, PullStatus.Failed, "delivery_key_invalid", ct).ConfigureAwait(false);
            throw new CreditException(CreditError.BadRequest, "Delivery key unusable.");
        }
        catch (OperationCanceledException)
        {
            // The caller went away mid-call; the maintenance sweep frees the slot if this doesn't.
            await FinishAsync(pull, PullStatus.Failed, "cancelled", CancellationToken.None).ConfigureAwait(false);
            throw;
        }

        var done = clock.UtcNow;
        Db.InboxPayloads.Add(new InboxPayloadRow
        {
            Id = payloadId,
            UserId = userId,
            PullId = pull.Id,
            Kind = CreditReport.Kind,
            Alg = DeliveryBox.Alg,
            SealedPayload = sealedReport,
            CreatedAt = done,
            ExpiresAt = done + CreditRules.InboxRetention,
        });
        pull.Status = PullStatus.Succeeded;
        pull.CompletedAt = done;
        pull.UpdatedAt = done;
        await outbox.PublishAsync(new CreditReportReadyV1(userId, payloadId, done)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        return new PullResult(pull.Id, payloadId, CreditRules.Wire(pull.Status), pull.RequestedAt, pull.RequestedAt + CreditRules.PullInterval);
    }

    public async Task<PullHistory> HistoryAsync(Guid userId, CancellationToken ct)
    {
        var rows = await Db.Pulls.AsNoTracking().Where(p => p.UserId == userId)
            .OrderByDescending(p => p.RequestedAt).Take(50).ToListAsync(ct).ConfigureAwait(false);
        var payloads = await Db.InboxPayloads.AsNoTracking().Where(p => p.UserId == userId)
            .Select(p => new { p.PullId, p.Id }).ToListAsync(ct).ConfigureAwait(false);
        var payloadOf = payloads.ToDictionary(p => p.PullId, p => p.Id);
        var next = CreditRules.NextAllowedAt(rows.Where(r => r.Status == PullStatus.Succeeded).Select(r => (DateTimeOffset?)r.RequestedAt).Max());
        return new PullHistory(
            [.. rows.Select(r => new PullView(r.Id, payloadOf.TryGetValue(r.Id, out var p) ? p : null, CreditRules.Wire(r.Status),
                r.Provider, r.ConsentTextVersion, r.RequestedAt, r.CompletedAt, r.ErrorCode))],
            next > clock.UtcNow ? next : null);
    }

    public async Task<IReadOnlyList<InboxItem>> InboxAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        return await Db.InboxPayloads.AsNoTracking()
            .Where(p => p.UserId == userId && p.ExpiresAt > now)
            .OrderBy(p => p.CreatedAt).Take(InboxPage)
            .Select(p => new InboxItem(p.Id, p.Kind, p.PullId, p.Alg, p.SealedPayload, p.CreatedAt, p.ExpiresAt))
            .ToListAsync(ct).ConfigureAwait(false);
    }

    public async Task AckAsync(Guid userId, Guid payloadId, CancellationToken ct)
    {
        if (await Db.InboxPayloads.Where(p => p.Id == payloadId && p.UserId == userId).ExecuteDeleteAsync(ct).ConfigureAwait(false) == 0)
            throw new CreditException(CreditError.NotFound, "No such payload for this user.");
    }

    /// <summary>
    /// The user withdraws their consent: every undelivered report goes now.
    /// The pull records stay (that a pull happened, under which text), and go
    /// with the account.
    /// </summary>
    public async Task WithdrawAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        await Db.InboxPayloads.Where(p => p.UserId == userId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await outbox.PublishAsync(new CreditConsentWithdrawnV1(userId, now)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
    }

    private Task<DateTimeOffset?> LastSuccessAsync(Guid userId, CancellationToken ct) =>
        Db.Pulls.Where(p => p.UserId == userId && p.Status == PullStatus.Succeeded)
            .MaxAsync(p => (DateTimeOffset?)p.RequestedAt, ct);

    private async Task FinishAsync(CreditPullRow pull, PullStatus status, string? error, CancellationToken ct)
    {
        pull.Status = status;
        pull.ErrorCode = error;
        pull.CompletedAt = clock.UtcNow;
        pull.UpdatedAt = pull.CompletedAt.Value;
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}

/// <summary>Internal, hourly (§8.9): inbox retention, and pulls stuck mid-call.</summary>
public sealed record RunCreditMaintenance;

public static class CreditMaintenanceHandler
{
    public static async Task Handle(RunCreditMaintenance command, CreditDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var now = clock.UtcNow;
        await db.InboxPayloads.Where(p => p.ExpiresAt <= now).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        var stuck = now - CreditRules.StuckAfter;
        await db.Pulls.Where(p => p.Status == PullStatus.InProgress && p.RequestedAt <= stuck)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, PullStatus.Failed)
                .SetProperty(p => p.ErrorCode, "interrupted")
                .SetProperty(p => p.CompletedAt, now)
                .SetProperty(p => p.UpdatedAt, now), ct).ConfigureAwait(false);
    }
}

/// <summary>Deletes everything Credit holds for a user. Internal: never on the broker.</summary>
public sealed record PurgeUserCredit(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>Credit's part of the account-deletion saga: pull records and sealed reports go, then <see cref="UserDataPurgedV1"/>.</summary>
public static class AccountDeletionHandler
{
    public const string ServiceName = "credit";

    public static async Task Handle(AccountDeletionRequestedV1 message, IMessageContext bus, IClock clock)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var purge = new PurgeUserCredit(message.UserId, message.ExecuteAfter);
        if (message.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    public static async Task<OutgoingMessages> Handle(
        PurgeUserCredit command, CreditDbContext db, DeletionCancellations cancellations, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(cancellations);
        ArgumentNullException.ThrowIfNull(clock);
        if (await cancellations.IsCancelledAsync(command.UserId, command.ExecuteAfter, ct).ConfigureAwait(false)) return [];
        await db.InboxPayloads.Where(p => p.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Pulls.Where(p => p.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        return [new UserDataPurgedV1(command.UserId, ServiceName, clock.UtcNow)];
    }
}
