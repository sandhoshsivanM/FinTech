using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Devices.Application.Persistence;

/// <summary>
/// Devices & Keys' own database (design doc §8.1). It holds public keys and
/// ciphertext only: with all of it, nobody can decrypt a user's data.
/// </summary>
public sealed class DevicesDbContext(DbContextOptions<DevicesDbContext> options) : DbContext(options)
{
    public DbSet<DeviceRow> Devices => Set<DeviceRow>();
    public DbSet<KeyEnvelopeRow> KeyEnvelopes => Set<KeyEnvelopeRow>();
    public DbSet<KeyCheckRow> KeyChecks => Set<KeyCheckRow>();
    public DbSet<PairingSessionRow> PairingSessions => Set<PairingSessionRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("devices");

        modelBuilder.Entity<DeviceRow>(e =>
        {
            e.ToTable("devices");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(64);
            e.Property(x => x.Platform).HasColumnName("platform").HasMaxLength(16);
            e.Property(x => x.AppVersion).HasColumnName("app_version").HasMaxLength(32);
            e.Property(x => x.PublicKey).HasColumnName("public_key");
            e.Property(x => x.DpopJkt).HasColumnName("dpop_jkt").HasMaxLength(64);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.LastSeenAt).HasColumnName("last_seen_at");
            e.Property(x => x.RevokedAt).HasColumnName("revoked_at");
            e.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<KeyEnvelopeRow>(e =>
        {
            e.ToTable("key_envelopes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.WrappedDek).HasColumnName("wrapped_dek");
            e.Property(x => x.Alg).HasColumnName("alg").HasMaxLength(32);
            e.Property(x => x.KeyVersion).HasColumnName("key_version");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            // One envelope per device per key version; one recovery envelope per version.
            e.HasIndex(x => new { x.UserId, x.DeviceId, x.KeyVersion }).IsUnique().HasFilter("device_id IS NOT NULL");
            e.HasIndex(x => new { x.UserId, x.KeyVersion }).IsUnique().HasFilter("device_id IS NULL")
                .HasDatabaseName("ix_key_envelopes_recovery");
        });

        modelBuilder.Entity<KeyCheckRow>(e =>
        {
            e.ToTable("key_checks");
            e.HasKey(x => new { x.UserId, x.KeyVersion });
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.KeyVersion).HasColumnName("key_version");
            e.Property(x => x.CheckHash).HasColumnName("check_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<PairingSessionRow>(e =>
        {
            e.ToTable("pairing_sessions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.NewDeviceId).HasColumnName("new_device_id");
            e.Property(x => x.CodeHash).HasColumnName("code_hash");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.CompletedAt).HasColumnName("completed_at");
            e.HasIndex(x => x.UserId);
        });
    }
}

public sealed class DeviceRow
{
    /// <summary>The device id Identity put in the session's tokens (<c>did</c>).</summary>
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public required string Platform { get; set; }
    public string? AppVersion { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public required byte[] PublicKey { get; set; }
#pragma warning restore CA1819
    public required string DpopJkt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}

/// <summary>The DEK wrapped for one device, or (<see cref="DeviceId"/> null) for the recovery phrase.</summary>
public sealed class KeyEnvelopeRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? DeviceId { get; set; }
#pragma warning disable CA1819
    public required byte[] WrappedDek { get; set; }
#pragma warning restore CA1819
    public required string Alg { get; set; }
    public int KeyVersion { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// SHA-256 of the key-check value. A device that presents the value proves it
/// holds the DEK, without the server ever learning anything about the DEK.
/// </summary>
public sealed class KeyCheckRow
{
    public Guid UserId { get; set; }
    public int KeyVersion { get; set; }
#pragma warning disable CA1819
    public required byte[] CheckHash { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PairingSessionRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid NewDeviceId { get; set; }
#pragma warning disable CA1819
    public required byte[] CodeHash { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<DevicesDbContext>
{
    public DevicesDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<DevicesDbContext>().UseNpgsql("Host=localhost;Database=devices_design").Options);
}
