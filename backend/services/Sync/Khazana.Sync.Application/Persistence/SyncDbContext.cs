using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Sync.Application.Persistence;

/// <summary>Sync's own database (design doc §8.1): ciphertext and routing metadata only.</summary>
public sealed class SyncDbContext(DbContextOptions<SyncDbContext> options) : DbContext(options)
{
    public DbSet<SyncUserRow> Users => Set<SyncUserRow>();
    public DbSet<SyncRecordRow> Records => Set<SyncRecordRow>();
    public DbSet<RevokedDeviceRow> RevokedDevices => Set<RevokedDeviceRow>();
    public DbSet<AttachmentRow> Attachments => Set<AttachmentRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("sync");

        modelBuilder.Entity<SyncUserRow>(e =>
        {
            e.ToTable("sync_users");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.LastSeq).HasColumnName("last_seq");
            e.Property(x => x.PurgedThroughSeq).HasColumnName("purged_through_seq");
            e.Property(x => x.ResetEpoch).HasColumnName("reset_epoch");
        });

        modelBuilder.Entity<SyncRecordRow>(e =>
        {
            e.ToTable("sync_records");
            e.HasKey(x => new { x.UserId, x.RecordId });
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.RecordId).HasColumnName("record_id").HasMaxLength(64);
            e.Property(x => x.Collection).HasColumnName("collection").HasMaxLength(32);
            e.Property(x => x.Seq).HasColumnName("seq");
            e.Property(x => x.ClientUpdatedAt).HasColumnName("client_updated_at");
            e.Property(x => x.Deleted).HasColumnName("deleted");
            e.Property(x => x.Ciphertext).HasColumnName("ciphertext");
            e.Property(x => x.KeyVersion).HasColumnName("key_version");
            e.Property(x => x.FromDeviceId).HasColumnName("from_device_id");
            e.Property(x => x.StoredAt).HasColumnName("stored_at");
            // Pull reads "this user's records after seq N, in order".
            e.HasIndex(x => new { x.UserId, x.Seq });
            // Tombstone purge reads "deleted records stored before T".
            e.HasIndex(x => x.StoredAt).HasFilter("deleted");
        });

        modelBuilder.Entity<AttachmentRow>(e =>
        {
            e.ToTable("attachments");
            e.HasKey(x => new { x.UserId, x.AttachmentId });
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.AttachmentId).HasColumnName("attachment_id").HasMaxLength(64);
            e.Property(x => x.Size).HasColumnName("size");
            e.Property(x => x.StoredAt).HasColumnName("stored_at");
        });

        modelBuilder.Entity<RevokedDeviceRow>(e =>
        {
            e.ToTable("revoked_devices");
            e.HasKey(x => x.DeviceId);
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.RevokedAt).HasColumnName("revoked_at");
            e.HasIndex(x => x.UserId);
        });
    }
}

/// <summary>A user's sequence counter, and how far tombstones have been purged.</summary>
public sealed class SyncUserRow
{
    public Guid UserId { get; set; }
    public long LastSeq { get; set; }
    public long PurgedThroughSeq { get; set; }

    /// <summary>Goes up by one at every tombstone purge that touched this user; cursors carry it.</summary>
    public long ResetEpoch { get; set; }
}

public sealed class SyncRecordRow
{
    public Guid UserId { get; set; }
    public required string RecordId { get; set; }
    public required string Collection { get; set; }
    public long Seq { get; set; }
    public DateTimeOffset ClientUpdatedAt { get; set; }
    public bool Deleted { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public required byte[] Ciphertext { get; set; }
#pragma warning restore CA1819
    public int KeyVersion { get; set; }
    public Guid FromDeviceId { get; set; }
    public DateTimeOffset StoredAt { get; set; }
}

/// <summary>An attachment's bookkeeping; the ciphertext itself is in the attachment store.</summary>
public sealed class AttachmentRow
{
    public Guid UserId { get; set; }
    public required string AttachmentId { get; set; }
    public long Size { get; set; }
    public DateTimeOffset StoredAt { get; set; }
}

/// <summary>Devices logged out remotely (from <c>DeviceRevokedV1</c>): refused here at once.</summary>
public sealed class RevokedDeviceRow
{
    public Guid DeviceId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset RevokedAt { get; set; }
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<SyncDbContext>
{
    public SyncDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<SyncDbContext>().UseNpgsql("Host=localhost;Database=sync_design").Options);
}
