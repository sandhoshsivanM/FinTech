using Khazana.Credit.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Credit.Application.Persistence;

/// <summary>
/// The Credit service's own database (design doc §8.1, <c>credit</c>): that a
/// pull happened (never the report, the score, the PAN or the mobile), and
/// reports sealed to the user's delivery key until the app collects them.
/// </summary>
public sealed class CreditDbContext(DbContextOptions<CreditDbContext> options) : DbContext(options)
{
    public DbSet<CreditPullRow> Pulls => Set<CreditPullRow>();
    public DbSet<InboxPayloadRow> InboxPayloads => Set<InboxPayloadRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("credit");

        modelBuilder.Entity<CreditPullRow>(e =>
        {
            e.ToTable("credit_pulls");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(32);
            e.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ConsentTextVersion).HasColumnName("consent_text_version").HasMaxLength(64);
            e.Property(x => x.Purpose).HasColumnName("purpose").HasMaxLength(64);
            e.Property(x => x.RequestedAt).HasColumnName("requested_at");
            e.Property(x => x.CompletedAt).HasColumnName("completed_at");
            e.Property(x => x.ErrorCode).HasColumnName("error_code").HasMaxLength(64);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => new { x.UserId, x.RequestedAt });
            // One pull at a time per user: two taps can't buy two reports.
            e.HasIndex(x => x.UserId).IsUnique().HasFilter("status = 'InProgress'").HasDatabaseName("ix_credit_pulls_one_in_progress");
        });

        modelBuilder.Entity<InboxPayloadRow>(e =>
        {
            e.ToTable("inbox_payloads");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.PullId).HasColumnName("pull_id");
            e.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(32);
            e.Property(x => x.Alg).HasColumnName("alg").HasMaxLength(32);
            e.Property(x => x.SealedPayload).HasColumnName("sealed_payload");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.HasOne<CreditPullRow>().WithMany().HasForeignKey(x => x.PullId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
            e.HasIndex(x => x.ExpiresAt);
        });
    }
}

/// <summary>That a pull happened, under which consent text. Nothing from the report.</summary>
public sealed class CreditPullRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public PullStatus Status { get; set; }
    public required string ConsentTextVersion { get; set; }
    public required string Purpose { get; set; }
    public DateTimeOffset RequestedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? ErrorCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>A report sealed to the user's delivery key, waiting for the app. Deleted on ack.</summary>
public sealed class InboxPayloadRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid PullId { get; set; }
    public required string Kind { get; set; }
    public required string Alg { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public required byte[] SealedPayload { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CreditDbContext>
{
    public CreditDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<CreditDbContext>().UseNpgsql("Host=localhost;Database=credit_design").Options);
}
