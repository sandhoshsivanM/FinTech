using Khazana.Messaging.Contracts;
using Khazana.Sync.Application.Persistence;
using Khazana.Sync.Domain;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Wolverine;

namespace Khazana.Sync.Application;

/// <summary>Store a device's batch. Internal command: never on the broker.</summary>
public sealed record PushRecords(Guid UserId, Guid DeviceId, IReadOnlyList<IncomingRecord> Records);

/// <param name="Stale">Records not stored because the server already holds a newer version; the device pulls and merges.</param>
/// <param name="LastSeq">The user's sequence number after this push.</param>
public sealed record PushResult(int Accepted, IReadOnlyList<string> Stale, long LastSeq);

/// <summary>
/// Stores a push and announces it, in one transaction (Wolverine's EF Core
/// transaction and outbox): records saved and <see cref="RecordsPushedV1"/>
/// queued, or neither.
/// </summary>
public static class PushRecordsHandler
{
    // Reserves n sequence numbers for the user in one statement. The row lock
    // serialises pushes per user, so two devices never get the same numbers.
    private const string AllocateSql = """
        INSERT INTO sync.sync_users (user_id, last_seq, purged_through_seq) VALUES (@user, @n, 0)
        ON CONFLICT (user_id) DO UPDATE SET last_seq = sync_users.last_seq + @n
        RETURNING last_seq AS "Value"
        """;

    // The whole batch in one statement (unnest of parallel arrays). An older
    // version never replaces a newer one, so a device with a stale copy can't
    // undo another device's edit; RETURNING says which rows were written.
    private const string UpsertSql = """
        INSERT INTO sync.sync_records
            (user_id, record_id, collection, seq, client_updated_at, deleted, ciphertext, key_version, from_device_id, stored_at)
        SELECT @user, r.record_id, r.collection, r.seq, r.client_updated_at, r.deleted, r.ciphertext, r.key_version, @device, @now
        FROM unnest(@ids, @collections, @seqs, @updated, @deleted, @ciphertexts, @versions)
            AS r(record_id, collection, seq, client_updated_at, deleted, ciphertext, key_version)
        ON CONFLICT (user_id, record_id) DO UPDATE SET
            collection = EXCLUDED.collection, seq = EXCLUDED.seq, client_updated_at = EXCLUDED.client_updated_at,
            deleted = EXCLUDED.deleted, ciphertext = EXCLUDED.ciphertext, key_version = EXCLUDED.key_version,
            from_device_id = EXCLUDED.from_device_id, stored_at = EXCLUDED.stored_at
        WHERE sync_records.client_updated_at <= EXCLUDED.client_updated_at
        RETURNING record_id AS "Value"
        """;

    public static async Task<(PushResult, OutgoingMessages)> Handle(PushRecords command, SyncDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var now = clock.UtcNow;
        if (SyncRules.Validate(command.Records, now) is { } problem) throw new SyncException(SyncError.BadRequest, problem);
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("PushRecords must run inside Wolverine's transaction.");

        var records = command.Records;
        var n = records.Count;
        var last = (await db.Database.SqlQueryRaw<long>(AllocateSql,
                new NpgsqlParameter("user", command.UserId), new NpgsqlParameter("n", (long)n))
            .ToListAsync(ct).ConfigureAwait(false)).Single();

        var written = await db.Database.SqlQueryRaw<string>(UpsertSql,
                new NpgsqlParameter("user", command.UserId),
                new NpgsqlParameter("device", command.DeviceId),
                new NpgsqlParameter("now", now),
                Array("ids", NpgsqlDbType.Text, records.Select(r => r.RecordId).ToArray()),
                Array("collections", NpgsqlDbType.Text, records.Select(r => r.Collection).ToArray()),
                Array("seqs", NpgsqlDbType.Bigint, Enumerable.Range(0, n).Select(i => last - n + 1 + i).ToArray()),
                Array("updated", NpgsqlDbType.TimestampTz, records.Select(r => r.ClientUpdatedAt).ToArray()),
                Array("deleted", NpgsqlDbType.Boolean, records.Select(r => r.Deleted).ToArray()),
                Array("ciphertexts", NpgsqlDbType.Bytea, records.Select(r => r.Ciphertext ?? []).ToArray()),
                Array("versions", NpgsqlDbType.Integer, records.Select(r => r.KeyVersion).ToArray()))
            .ToListAsync(ct).ConfigureAwait(false);

        var accepted = written.ToHashSet(StringComparer.Ordinal);
        var stale = records.Select(r => r.RecordId).Where(id => !accepted.Contains(id)).ToList();
        var outgoing = new OutgoingMessages();
        if (accepted.Count > 0) outgoing.Add(new RecordsPushedV1(command.UserId, command.DeviceId, last));
        return (new PushResult(accepted.Count, stale, last), outgoing);
    }

    private static NpgsqlParameter Array<T>(string name, NpgsqlDbType elementType, T[] values) =>
        new(name, NpgsqlDbType.Array | elementType) { Value = values };
}

/// <summary>Remember a remotely logged-out device, so its next call is refused.</summary>
public static class DeviceRevokedHandler
{
    public static async Task Handle(DeviceRevokedV1 message, SyncDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(db);
        if (await db.RevokedDevices.AnyAsync(d => d.DeviceId == message.DeviceId, ct).ConfigureAwait(false)) return;
        db.RevokedDevices.Add(new RevokedDeviceRow { DeviceId = message.DeviceId, UserId = message.UserId, RevokedAt = message.At });
    }
}

/// <summary>Delete everything Sync holds for a user. Internal command.</summary>
public sealed record PurgeUserSync(Guid UserId);

/// <summary>Sync's part of the account-deletion saga.</summary>
public static class AccountDeletionHandler
{
    public const string ServiceName = "sync";

    public static async Task Handle(AccountDeletionRequestedV1 message, IMessageContext bus, IClock clock)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var purge = new PurgeUserSync(message.UserId);
        if (message.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    public static async Task<UserDataPurgedV1> Handle(PurgeUserSync command, SyncDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        // A user's records can be many; delete in the database, inside this transaction.
        await db.Records.Where(r => r.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.Users.Where(u => u.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.RevokedDevices.Where(d => d.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        return new UserDataPurgedV1(command.UserId, ServiceName, clock.UtcNow);
    }
}

/// <summary>Drop tombstones past retention. Internal command, sent by the sweeper.</summary>
public sealed record PurgeTombstones;

public static class PurgeTombstonesHandler
{
    // Deletes old tombstones and, per user, remembers the newest seq removed:
    // a device whose cursor is behind it may have missed a deletion.
    private const string Sql = """
        WITH gone AS (
            DELETE FROM sync.sync_records WHERE deleted AND stored_at < @cutoff
            RETURNING user_id, seq
        )
        UPDATE sync.sync_users u SET purged_through_seq = GREATEST(u.purged_through_seq, g.max_seq)
        FROM (SELECT user_id, max(seq) AS max_seq FROM gone GROUP BY user_id) g
        WHERE u.user_id = g.user_id
        """;

    public static Task Handle(PurgeTombstones command, SyncDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        return db.Database.ExecuteSqlRawAsync(Sql, [new NpgsqlParameter("cutoff", clock.UtcNow - SyncRules.TombstoneRetention)], ct);
    }
}
