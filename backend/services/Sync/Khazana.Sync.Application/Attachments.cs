using Khazana.Sync.Application.Persistence;
using Khazana.Sync.Domain;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Sync.Application;

/// <summary>
/// Where attachment ciphertext lives (decision D15: local disk in development,
/// S3 in the cloud). Keys are <c>user/attachment</c>; the store never sees plaintext.
/// </summary>
public interface IAttachmentStore
{
    Task PutAsync(Guid userId, string attachmentId, Stream content, CancellationToken ct);

    /// <summary>Null when there is no such object.</summary>
    Task<Stream?> GetAsync(Guid userId, string attachmentId, CancellationToken ct);

    Task DeleteAsync(Guid userId, string attachmentId, CancellationToken ct);

    Task DeleteUserAsync(Guid userId, CancellationToken ct);
}

/// <summary>Reads at most <paramref name="max"/> bytes; more is refused rather than trusted to a header.</summary>
public sealed class CappedStream(Stream inner, long max) : Stream
{
    public long BytesRead { get; private set; }

    public override int Read(byte[] buffer, int offset, int count) => Count(inner.Read(buffer, offset, count));

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        Count(await inner.ReadAsync(buffer, cancellationToken).ConfigureAwait(false));

    private int Count(int n)
    {
        BytesRead += n;
        if (BytesRead > max) throw new SyncException(SyncError.BadRequest, "Attachment too large.");
        return n;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => BytesRead; set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

/// <summary>Attachments for the calling user: put, get, delete, within size and quota.</summary>
public sealed class AttachmentService(SyncDbContext db, IAttachmentStore store, IClock clock)
{
    public async Task PutAsync(Guid userId, string attachmentId, Stream body, long? declaredLength, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(body);
        if (!AttachmentRules.IsValidId(attachmentId)) throw new SyncException(SyncError.BadRequest, "Bad attachment id.");
        if (declaredLength is > AttachmentRules.MaxBytes) throw new SyncException(SyncError.BadRequest, "Attachment too large.");

        var used = await db.Attachments.Where(a => a.UserId == userId && a.AttachmentId != attachmentId)
            .SumAsync(a => (long?)a.Size, ct).ConfigureAwait(false) ?? 0;
        var room = Math.Min(AttachmentRules.MaxBytes, AttachmentRules.QuotaBytes - used);
        if (room <= 0) throw new SyncException(SyncError.BadRequest, "Attachment quota used up.");

        var capped = new CappedStream(body, room);
        await store.PutAsync(userId, attachmentId, capped, ct).ConfigureAwait(false);

        var row = await db.Attachments.FirstOrDefaultAsync(a => a.UserId == userId && a.AttachmentId == attachmentId, ct).ConfigureAwait(false);
        if (row is null) db.Attachments.Add(new AttachmentRow { UserId = userId, AttachmentId = attachmentId, Size = capped.BytesRead, StoredAt = clock.UtcNow });
        else
        {
            row.Size = capped.BytesRead;
            row.StoredAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    public async Task<Stream?> GetAsync(Guid userId, string attachmentId, CancellationToken ct)
    {
        if (!AttachmentRules.IsValidId(attachmentId)) return null;
        if (!await db.Attachments.AnyAsync(a => a.UserId == userId && a.AttachmentId == attachmentId, ct).ConfigureAwait(false)) return null;
        return await store.GetAsync(userId, attachmentId, ct).ConfigureAwait(false);
    }

    public async Task DeleteAsync(Guid userId, string attachmentId, CancellationToken ct)
    {
        if (!AttachmentRules.IsValidId(attachmentId)) return;
        await store.DeleteAsync(userId, attachmentId, ct).ConfigureAwait(false);
        await db.Attachments.Where(a => a.UserId == userId && a.AttachmentId == attachmentId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
    }
}

/// <summary>Account deletion: every attachment of the user, rows and objects.</summary>
public static class AttachmentPurge
{
    public static async Task PurgeUserAsync(SyncDbContext db, IAttachmentStore store, Guid userId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(store);
        await store.DeleteUserAsync(userId, ct).ConfigureAwait(false);
        await db.Attachments.Where(a => a.UserId == userId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
    }
}
