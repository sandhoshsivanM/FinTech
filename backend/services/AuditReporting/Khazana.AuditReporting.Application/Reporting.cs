using Khazana.AuditReporting.Application.Persistence;
using Khazana.AuditReporting.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;

namespace Khazana.AuditReporting.Application;

/// <summary>Appends to the hash-chained audit log.</summary>
public sealed class AuditWriter(ReportingDbContext db)
{
    /// <summary>
    /// Must run inside a transaction. A transaction-scoped advisory lock makes
    /// appends one at a time, so two writers never chain onto the same previous
    /// hash; it is released when the transaction ends.
    /// </summary>
    public async Task AppendAsync(AuditEntry entry, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(entry);
        if (!ReportingRules.IsValid(entry)) throw new ArgumentException("Audit entry is malformed.", nameof(entry));
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Audit appends must run inside a transaction.");

        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtext('khazana.audit_chain'))", ct).ConfigureAwait(false);
        var previous = await db.AuditEvents.AsNoTracking().OrderByDescending(a => a.Id)
            .Select(a => a.Hash).FirstOrDefaultAsync(ct).ConfigureAwait(false) ?? AuditChain.Genesis;
        db.AuditEvents.Add(new AuditEventRow
        {
            At = entry.At,
            Actor = entry.Actor,
            Action = entry.Action,
            Target = entry.Target,
            Reason = entry.Reason,
            PreviousHash = previous,
            Hash = AuditChain.Hash(previous, entry),
        });
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}

/// <summary>
/// Builds the directory, sign-in history and audit log from events. Each
/// handler runs in Wolverine's transaction; redelivered events are absorbed by
/// the durable inbox.
/// </summary>
public static class ProjectionHandler
{
    public static async Task Handle(UserRegisteredV1 m, ReportingDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        var row = await EnsureDirectoryAsync(db, m.UserId, m.At, ct).ConfigureAwait(false);
        if (row is not null && m.At < row.RegisteredAt) row.RegisteredAt = m.At;
    }

    public static async Task Handle(UserSignedInV1 m, ReportingDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        var row = await EnsureDirectoryAsync(db, m.UserId, m.At, ct).ConfigureAwait(false);
        if (row is null) return;
        if (m.At > row.LastActiveAt) row.LastActiveAt = m.At;
        if (!row.Platforms.Contains(m.Platform)) row.Platforms = [.. row.Platforms, m.Platform];
        db.SigninEvents.Add(new SigninEventRow { UserId = m.UserId, DeviceId = m.DeviceId, Platform = m.Platform, At = m.At });
    }

    public static async Task Handle(DeviceAddedV1 m, ReportingDbContext db, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        var row = await EnsureDirectoryAsync(db, m.UserId, m.At, ct).ConfigureAwait(false);
        if (row is not null) row.DeviceCount++;
        await audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "device.added", $"device:{m.DeviceId}", null), ct).ConfigureAwait(false);
    }

    public static async Task Handle(DeviceRevokedV1 m, ReportingDbContext db, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        var row = await db.Directory.FirstOrDefaultAsync(d => d.UserId == m.UserId, ct).ConfigureAwait(false);
        if (row is not null && row.DeviceCount > 0) row.DeviceCount--;
        await audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "device.revoked", $"device:{m.DeviceId}", null), ct).ConfigureAwait(false);
    }

    public static async Task Handle(AccountDeletionRequestedV1 m, ReportingDbContext db, AuditWriter audit, IMessageContext bus, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var row = await db.Directory.FirstOrDefaultAsync(d => d.UserId == m.UserId, ct).ConfigureAwait(false);
        if (row is not null) row.Status = DirectoryStatus.DeletionRequested;
        await audit.AppendAsync(new AuditEntry(clock.UtcNow, $"user:{m.UserId}", "account.deletion_requested", $"user:{m.UserId}", null), ct).ConfigureAwait(false);

        // Reporting holds sign-in history: it purges too, after the cooling-off.
        var purge = new PurgeUserReporting(m.UserId);
        if (m.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, m.ExecuteAfter).ConfigureAwait(false);
    }

    public static Task Handle(UserDataPurgedV1 m, AuditWriter audit)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, $"system:{m.Service}", "account.data_purged", $"user:{m.UserId}", null), CancellationToken.None);
    }

    public static async Task Handle(AccountDeletedV1 m, ReportingDbContext db, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        await db.Directory.Where(d => d.UserId == m.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await audit.AppendAsync(new AuditEntry(m.At, "system:identity", "account.deleted", $"user:{m.UserId}", null), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Events arrive on separate queues, so a sign-in may beat its registration.
    /// Either creates the entry; a purged user never comes back.
    /// </summary>
    private static async Task<DirectoryRow?> EnsureDirectoryAsync(ReportingDbContext db, Guid userId, DateTimeOffset at, CancellationToken ct)
    {
        if (await db.DeletedUsers.AnyAsync(d => d.UserId == userId, ct).ConfigureAwait(false)) return null;
        var row = await db.Directory.FirstOrDefaultAsync(d => d.UserId == userId, ct).ConfigureAwait(false);
        if (row is not null) return row;
        row = db.Directory.Local.FirstOrDefault(d => d.UserId == userId);
        if (row is not null) return row;
        row = new DirectoryRow { UserId = userId, RegisteredAt = at, LastActiveAt = at, Platforms = [], DeviceCount = 0, Status = DirectoryStatus.Active };
        db.Directory.Add(row);
        return row;
    }
}

public sealed record PurgeUserReporting(Guid UserId);

/// <summary>Reporting's part of the account-deletion saga: sign-ins and the directory entry go; audit records (ids only) stay.</summary>
public static class PurgeUserReportingHandler
{
    public const string ServiceName = "reporting";

    public static async Task<UserDataPurgedV1> Handle(PurgeUserReporting command, ReportingDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        await db.SigninEvents.Where(s => s.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Directory.Where(d => d.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        if (!await db.DeletedUsers.AnyAsync(d => d.UserId == command.UserId, ct).ConfigureAwait(false))
            db.DeletedUsers.Add(new DeletedUserRow { UserId = command.UserId });
        return new UserDataPurgedV1(command.UserId, ServiceName, clock.UtcNow);
    }
}

public sealed record PurgeOldSignins;

/// <summary>Sign-in history is kept 180 days (CERT-In), then dropped.</summary>
public static class PurgeOldSigninsHandler
{
    public static Task Handle(PurgeOldSignins command, ReportingDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var cutoff = clock.UtcNow - ReportingRules.SigninRetention;
        return db.SigninEvents.Where(s => s.At < cutoff).ExecuteDeleteAsync(ct);
    }
}
