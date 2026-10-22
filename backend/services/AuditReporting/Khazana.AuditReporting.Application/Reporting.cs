using Khazana.AuditReporting.Application.Persistence;
using Khazana.AuditReporting.Domain;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wolverine;

namespace Khazana.AuditReporting.Application;

/// <summary>Appends to the hash-chained audit log.</summary>
public sealed class AuditWriter(ReportingDbContext db, AuditKey key)
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
        var row = new AuditEventRow
        {
            At = AuditChain.ToStoredPrecision(entry.At),
            Actor = entry.Actor,
            Action = entry.Action,
            Target = entry.Target,
            Reason = entry.Reason,
            PreviousHash = previous,
            Hash = AuditChain.Hash(previous, entry, key.Bytes),
            HashVersion = AuditChain.CurrentVersion,
        };
        db.AuditEvents.Add(row);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        await db.Database.ExecuteSqlAsync($"""
            INSERT INTO reporting.audit_head (id, last_id, last_hash) VALUES (1, {row.Id}, {row.Hash})
            ON CONFLICT (id) DO UPDATE SET last_id = EXCLUDED.last_id, last_hash = EXCLUDED.last_hash
            """, ct).ConfigureAwait(false);
    }
}

/// <summary>
/// Builds the directory, sign-in history and audit log from events. Each
/// handler runs in Wolverine's transaction; redelivered events are absorbed by
/// the durable inbox.
/// </summary>
/// <remarks>
/// One sign-up produces UserRegistered, UserSignedIn and DeviceAdded within
/// milliseconds, on three queues, handled in parallel. Every directory change
/// is therefore one atomic SQL upsert (insert-or-update, increments in the
/// database): a read-modify-write in C# would collide on the insert or lose an
/// increment. A purged user is never re-created.
/// </remarks>
public static class ProjectionHandler
{
    private const string NotDeleted = "NOT EXISTS (SELECT 1 FROM reporting.deleted_users WHERE user_id = @user)";

    private const string AppendPlatform =
        "CASE WHEN @platform = ANY(user_directory.platforms) THEN user_directory.platforms ELSE array_append(user_directory.platforms, @platform) END";

    public static Task Handle(UserRegisteredV1 m, ReportingDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        return db.Database.ExecuteSqlRawAsync($"""
            INSERT INTO reporting.user_directory (user_id, registered_at, last_active_at, platforms, device_count, status)
            SELECT @user, @at, @at, ARRAY[@platform]::text[], 0, 'active' WHERE {NotDeleted}
            ON CONFLICT (user_id) DO UPDATE SET
                registered_at = LEAST(user_directory.registered_at, EXCLUDED.registered_at),
                platforms = {AppendPlatform}
            """, Params(m.UserId, m.At, m.Platform), ct);
    }

    public static Task Handle(UserSignedInV1 m, ReportingDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        // The sign-in row is written only if the directory row exists (or was just made), so a purged user gets neither.
        return db.Database.ExecuteSqlRawAsync($"""
            WITH entry AS (
                INSERT INTO reporting.user_directory (user_id, registered_at, last_active_at, platforms, device_count, status)
                SELECT @user, @at, @at, ARRAY[@platform]::text[], 0, 'active' WHERE {NotDeleted}
                ON CONFLICT (user_id) DO UPDATE SET
                    last_active_at = GREATEST(user_directory.last_active_at, EXCLUDED.last_active_at),
                    platforms = {AppendPlatform}
                RETURNING user_id
            )
            INSERT INTO reporting.signin_events (user_id, device_id, platform, at)
            SELECT user_id, @device, @platform, @at FROM entry
            """, [.. Params(m.UserId, m.At, m.Platform), new NpgsqlParameter("device", m.DeviceId)], ct);
    }

    public static async Task Handle(DeviceAddedV1 m, ReportingDbContext db, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        await db.Database.ExecuteSqlRawAsync($"""
            INSERT INTO reporting.user_directory (user_id, registered_at, last_active_at, platforms, device_count, status)
            SELECT @user, @at, @at, ARRAY[@platform]::text[], 1, 'active' WHERE {NotDeleted}
            ON CONFLICT (user_id) DO UPDATE SET
                device_count = user_directory.device_count + 1,
                platforms = {AppendPlatform}
            """, Params(m.UserId, m.At, m.Platform), ct).ConfigureAwait(false);
        await audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "device.added", $"device:{m.DeviceId}", null), ct).ConfigureAwait(false);
    }

    public static async Task Handle(DeviceRevokedV1 m, ReportingDbContext db, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE reporting.user_directory SET device_count = GREATEST(device_count - 1, 0) WHERE user_id = @user",
            [new NpgsqlParameter("user", m.UserId)], ct).ConfigureAwait(false);
        await audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "device.revoked", $"device:{m.DeviceId}", null), ct).ConfigureAwait(false);
    }

    public static async Task Handle(AccountDeletionRequestedV1 m, ReportingDbContext db, AuditWriter audit, IMessageContext bus, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE reporting.user_directory SET status = 'deletion_requested' WHERE user_id = @user",
            [new NpgsqlParameter("user", m.UserId)], ct).ConfigureAwait(false);
        await audit.AppendAsync(new AuditEntry(clock.UtcNow, $"user:{m.UserId}", "account.deletion_requested", $"user:{m.UserId}", null), ct).ConfigureAwait(false);

        // Reporting holds sign-in history: it purges too, after the cooling-off.
        var purge = new PurgeUserReporting(m.UserId, m.ExecuteAfter);
        if (m.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, m.ExecuteAfter).ConfigureAwait(false);
    }

    /// <summary>The user changed their mind: back to active, and the reversal is on the record.</summary>
    public static async Task Handle(AccountDeletionCancelledV1 m, ReportingDbContext db, AuditWriter audit, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(audit);
        ArgumentNullException.ThrowIfNull(clock);
        await db.Database.ExecuteSqlRawAsync(
            "UPDATE reporting.user_directory SET status = 'active' WHERE user_id = @user",
            [new NpgsqlParameter("user", m.UserId)], ct).ConfigureAwait(false);
        await audit.AppendAsync(new AuditEntry(clock.UtcNow, $"user:{m.UserId}", "account.deletion_cancelled", $"user:{m.UserId}", null), ct).ConfigureAwait(false);
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

    private static NpgsqlParameter[] Params(Guid user, DateTimeOffset at, string platform) =>
        [new("user", user), new("at", at), new("platform", platform)];
}

public sealed record PurgeUserReporting(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>Reporting's part of the account-deletion saga: sign-ins and the directory entry go; audit records (ids only) stay.</summary>
public static class PurgeUserReportingHandler
{
    public const string ServiceName = "reporting";

    public static async Task<OutgoingMessages> Handle(
        PurgeUserReporting command, ReportingDbContext db, DeletionCancellations cancellations, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(cancellations);
        ArgumentNullException.ThrowIfNull(clock);
        if (await cancellations.IsCancelledAsync(command.UserId, command.ExecuteAfter, ct).ConfigureAwait(false)) return [];
        await db.SigninEvents.Where(s => s.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Directory.Where(d => d.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO reporting.deleted_users (user_id) VALUES (@user) ON CONFLICT DO NOTHING",
            [new NpgsqlParameter("user", command.UserId)], ct).ConfigureAwait(false);
        return [new UserDataPurgedV1(command.UserId, ServiceName, clock.UtcNow)];
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
