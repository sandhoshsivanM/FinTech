using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.AuditReporting.Application.Persistence;

/// <summary>
/// Audit & Reporting's own database (design doc §8.1, §8.10), filled only from
/// events. It has no route to any other service's data, and the events it is
/// built from carry no amounts, names or emails, so nothing here can show one.
/// </summary>
public sealed class ReportingDbContext(DbContextOptions<ReportingDbContext> options) : DbContext(options)
{
    public DbSet<AuditEventRow> AuditEvents => Set<AuditEventRow>();
    public DbSet<AuditHeadRow> AuditHead => Set<AuditHeadRow>();
    public DbSet<SigninEventRow> SigninEvents => Set<SigninEventRow>();
    public DbSet<DirectoryRow> Directory => Set<DirectoryRow>();
    public DbSet<DeletedUserRow> DeletedUsers => Set<DeletedUserRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("reporting");

        modelBuilder.Entity<AuditEventRow>(e =>
        {
            e.ToTable("audit_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").UseIdentityAlwaysColumn();
            e.Property(x => x.At).HasColumnName("at");
            e.Property(x => x.Actor).HasColumnName("actor").HasMaxLength(140);
            e.Property(x => x.Action).HasColumnName("action").HasMaxLength(64);
            e.Property(x => x.Target).HasColumnName("target").HasMaxLength(128);
            e.Property(x => x.Reason).HasColumnName("reason").HasMaxLength(280);
            e.Property(x => x.PreviousHash).HasColumnName("previous_hash");
            e.Property(x => x.Hash).HasColumnName("hash");
            e.Property(x => x.HashVersion).HasColumnName("hash_version").HasDefaultValue(1);
        });

        modelBuilder.Entity<AuditHeadRow>(e =>
        {
            e.ToTable("audit_head");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            e.Property(x => x.LastId).HasColumnName("last_id");
            e.Property(x => x.LastHash).HasColumnName("last_hash");
        });

        modelBuilder.Entity<SigninEventRow>(e =>
        {
            e.ToTable("signin_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").UseIdentityAlwaysColumn();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.Platform).HasColumnName("platform").HasMaxLength(16);
            e.Property(x => x.At).HasColumnName("at");
            e.HasIndex(x => new { x.UserId, x.At });
            e.HasIndex(x => x.At);
        });

        modelBuilder.Entity<DirectoryRow>(e =>
        {
            e.ToTable("user_directory");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.RegisteredAt).HasColumnName("registered_at");
            e.Property(x => x.LastActiveAt).HasColumnName("last_active_at");
            e.Property(x => x.Platforms).HasColumnName("platforms");
            e.Property(x => x.DeviceCount).HasColumnName("device_count");
            e.Property(x => x.Status).HasColumnName("status").HasMaxLength(24);
            e.HasIndex(x => x.RegisteredAt);
        });

        modelBuilder.Entity<DeletedUserRow>(e =>
        {
            e.ToTable("deleted_users");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasColumnName("user_id");
        });
    }
}

/// <summary>Append-only: the database refuses UPDATE and DELETE (see the migration).</summary>
public sealed class AuditEventRow
{
    public long Id { get; set; }
    public DateTimeOffset At { get; set; }
    public required string Actor { get; set; }
    public required string Action { get; set; }
    public required string Target { get; set; }
    public string? Reason { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public required byte[] PreviousHash { get; set; }
    public required byte[] Hash { get; set; }
#pragma warning restore CA1819
    public int HashVersion { get; set; }
}

/// <summary>
/// The newest record's id and MAC, written in the same transaction as the
/// record. Verification compares the chain's end with it, so records removed
/// from the end are noticed. (Someone who can also rewrite this row could hide
/// that; the nightly export to write-once storage in the cloud closes it.)
/// </summary>
public sealed class AuditHeadRow
{
    public int Id { get; set; }
    public long LastId { get; set; }
#pragma warning disable CA1819
    public required byte[] LastHash { get; set; }
#pragma warning restore CA1819
}

public sealed class SigninEventRow
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DeviceId { get; set; }
    public required string Platform { get; set; }
    public DateTimeOffset At { get; set; }
}

/// <summary>What an admin may know about a user: no name, no email, no money.</summary>
public sealed class DirectoryRow
{
    public Guid UserId { get; set; }
    public DateTimeOffset RegisteredAt { get; set; }
    public DateTimeOffset LastActiveAt { get; set; }
#pragma warning disable CA1819 // text[] column
    public required string[] Platforms { get; set; }
#pragma warning restore CA1819
    public int DeviceCount { get; set; }
    public required string Status { get; set; }
}

/// <summary>A purged user, so a late event can't bring their directory entry back.</summary>
public sealed class DeletedUserRow
{
    public Guid UserId { get; set; }
}

public static class DirectoryStatus
{
    public const string Active = "active";
    public const string DeletionRequested = "deletion_requested";
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ReportingDbContext>
{
    public ReportingDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<ReportingDbContext>().UseNpgsql("Host=localhost;Database=reporting_design").Options);
}
