using Khazana.Sync.Application.Persistence;
using Khazana.Sync.Domain;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Sync.Application;

public enum SyncError
{
    BadRequest,
    Forbidden,

    /// <summary>This deployment stores no attachments (Providers:Attachments=Disabled).</summary>
    Unavailable,
}

public sealed class SyncException : Exception
{
    public SyncException(SyncError error, string logMessage) : base(logMessage) => Error = error;
    public SyncException() : this(SyncError.BadRequest, "Refused.") { }
    public SyncException(string message) : this(SyncError.BadRequest, message) { }
    public SyncException(string message, Exception inner) : base(message, inner) => Error = SyncError.BadRequest;

    public SyncError Error { get; }
}

public sealed record PulledRecord(
    string RecordId, string Collection, long Seq, DateTimeOffset ClientUpdatedAt, bool Deleted, byte[] Ciphertext, int KeyVersion);

/// <param name="LastSeq">The cursor to send next time.</param>
/// <param name="Epoch">Send it back with the cursor (see <see cref="SyncRules.NeedsReset"/>).</param>
/// <param name="More">Another page is waiting.</param>
/// <param name="ResetRequired">The cursor is older than purged tombstones: resync from zero.</param>
public sealed record PullPage(IReadOnlyList<PulledRecord> Records, long LastSeq, long Epoch, bool More, bool ResetRequired);

/// <summary>Reads for the sync endpoints. Writes go through <see cref="PushRecordsHandler"/>.</summary>
public sealed class SyncService(SyncDbContext db)
{
    /// <summary>A device logged out remotely gets nothing, even with a token that has not expired yet.</summary>
    public async Task RequireActiveAsync(Guid deviceId, CancellationToken ct)
    {
        if (await db.RevokedDevices.AnyAsync(d => d.DeviceId == deviceId, ct).ConfigureAwait(false))
            throw new SyncException(SyncError.Forbidden, $"Device {deviceId} is revoked.");
    }

    public async Task<PullPage> PullAsync(Guid userId, long since, long epoch, int limit, CancellationToken ct)
    {
        if (since < 0) throw new SyncException(SyncError.BadRequest, "Negative cursor.");
        limit = Math.Clamp(limit, 1, SyncRules.MaxPage);

        // One snapshot for both reads: a purge committing between them could
        // otherwise delete a tombstone this page skips past without a reset.
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct).ConfigureAwait(false);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId, ct).ConfigureAwait(false);
        var currentEpoch = user?.ResetEpoch ?? 0;
        if (user is not null && SyncRules.NeedsReset(since, epoch, currentEpoch, user.PurgedThroughSeq))
            return new PullPage([], 0, currentEpoch, More: false, ResetRequired: true);

        var rows = await db.Records.AsNoTracking()
            .Where(r => r.UserId == userId && r.Seq > since)
            .OrderBy(r => r.Seq)
            .Take(limit + 1)
            .Select(r => new PulledRecord(r.RecordId, r.Collection, r.Seq, r.ClientUpdatedAt, r.Deleted, r.Ciphertext, r.KeyVersion))
            .ToListAsync(ct).ConfigureAwait(false);

        var more = rows.Count > limit;
        if (more) rows.RemoveAt(rows.Count - 1);
        await tx.CommitAsync(ct).ConfigureAwait(false);
        return new PullPage(rows, rows.Count > 0 ? rows[^1].Seq : since, currentEpoch, more, ResetRequired: false);
    }
}
