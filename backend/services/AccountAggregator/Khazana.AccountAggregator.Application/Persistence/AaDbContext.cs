using Khazana.AccountAggregator.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.AccountAggregator.Application.Persistence;

/// <summary>
/// The Account Aggregator's own database (design doc §8.1, <c>aa</c>). It
/// holds consent metadata, saga state and sealed payloads: no bank data is
/// readable here, by anyone, ever. Sealed payloads are ciphertext to the
/// user's delivery key and are deleted on ack, after 14 days, on consent end
/// and on account deletion.
/// </summary>
public sealed class AaDbContext(DbContextOptions<AaDbContext> options) : DbContext(options)
{
    public DbSet<ConsentRow> Consents => Set<ConsentRow>();
    public DbSet<FetchSagaRow> FetchSagas => Set<FetchSagaRow>();
    public DbSet<InboxPayloadRow> InboxPayloads => Set<InboxPayloadRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("aa");

        modelBuilder.Entity<ConsentRow>(e =>
        {
            e.ToTable("aa_consents");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Provider).HasColumnName("partner").HasMaxLength(32);
            e.Property(x => x.Handle).HasColumnName("consent_handle").HasMaxLength(128);
            e.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.FiTypes).HasColumnName("fi_types");
            e.Property(x => x.Frequency).HasColumnName("frequency").HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.DataFrom).HasColumnName("data_from");
            e.Property(x => x.DataTo).HasColumnName("data_to");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.DeliveryKey).HasColumnName("delivery_key");
            e.Property(x => x.RedirectUrl).HasColumnName("redirect_url").HasMaxLength(512);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.Property(x => x.ActivatedAt).HasColumnName("activated_at");
            e.Property(x => x.EndedAt).HasColumnName("ended_at");
            e.Property(x => x.LastFetchedAt).HasColumnName("last_fetched_at");
            e.Property(x => x.NextFetchAt).HasColumnName("next_fetch_at");
            e.Property(x => x.OwnerSeenAt).HasColumnName("owner_seen_at");
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => new { x.Provider, x.Handle }).IsUnique();
            e.HasIndex(x => new { x.Status, x.NextFetchAt });
        });

        modelBuilder.Entity<FetchSagaRow>(e =>
        {
            e.ToTable("aa_fetch_sagas");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ConsentId).HasColumnName("consent_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.State).HasColumnName("state").HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Trigger).HasColumnName("trigger").HasMaxLength(16);
            e.Property(x => x.Attempt).HasColumnName("attempt");
            e.Property(x => x.NextRetryAt).HasColumnName("next_retry_at");
            e.Property(x => x.ErrorCode).HasColumnName("error_code").HasMaxLength(64);
            e.Property(x => x.CostUnits).HasColumnName("cost_units");
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(128);
            e.Property(x => x.DataFrom).HasColumnName("data_from");
            e.Property(x => x.DataTo).HasColumnName("data_to");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.Property(x => x.RequestedAt).HasColumnName("requested_at");
            e.HasOne<ConsentRow>().WithMany().HasForeignKey(x => x.ConsentId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.SessionId);
            // One fetch in flight per consent: a second "fetch now" joins the first.
            e.HasIndex(x => x.ConsentId).IsUnique().HasFilter("state IN ('Requested', 'Fetching')")
                .HasDatabaseName("ix_aa_fetch_sagas_one_in_flight");
        });

        modelBuilder.Entity<InboxPayloadRow>(e =>
        {
            e.ToTable("inbox_payloads");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.ConsentId).HasColumnName("consent_id");
            e.Property(x => x.SagaId).HasColumnName("saga_id");
            e.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(32);
            e.Property(x => x.Alg).HasColumnName("alg").HasMaxLength(32);
            e.Property(x => x.SealedPayload).HasColumnName("sealed_payload");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.HasOne<ConsentRow>().WithMany().HasForeignKey(x => x.ConsentId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
            e.HasIndex(x => x.ExpiresAt);
        });
    }
}

public sealed class ConsentRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public required string Handle { get; set; }
    public ConsentStatus Status { get; set; }
#pragma warning disable CA1819 // arrays are how EF maps text[] and bytea
    public required string[] FiTypes { get; set; }
#pragma warning restore CA1819
    public FetchFrequency Frequency { get; set; }
    public DateOnly DataFrom { get; set; }
    public DateOnly DataTo { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>The user's X25519 delivery public key. Public by nature; it can seal, never open.</summary>
#pragma warning disable CA1819
    public required byte[] DeliveryKey { get; set; }
#pragma warning restore CA1819
    public string? RedirectUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public DateTimeOffset? LastFetchedAt { get; set; }
    public DateTimeOffset? NextFetchAt { get; set; }

    /// <summary>When the user last called this service: scheduled fetches skip users inactive 30 days.</summary>
    public DateTimeOffset OwnerSeenAt { get; set; }
}

public sealed class FetchSagaRow
{
    public Guid Id { get; set; }
    public Guid ConsentId { get; set; }
    public Guid UserId { get; set; }
    public FetchState State { get; set; }

    /// <summary><c>first</c>, <c>on_open</c> or <c>scheduled</c>.</summary>
    public required string Trigger { get; set; }
    public int Attempt { get; set; }
    public DateTimeOffset? NextRetryAt { get; set; }
    public string? ErrorCode { get; set; }
    public int CostUnits { get; set; }
    public string? SessionId { get; set; }
    public DateOnly DataFrom { get; set; }
    public DateOnly DataTo { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? RequestedAt { get; set; }
}

/// <summary>Ciphertext sealed to the user's delivery key, waiting for the app. Deleted on ack.</summary>
public sealed class InboxPayloadRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ConsentId { get; set; }
    public Guid? SagaId { get; set; }
    public required string Kind { get; set; }
    public required string Alg { get; set; }
#pragma warning disable CA1819
    public required byte[] SealedPayload { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AaDbContext>
{
    public AaDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<AaDbContext>().UseNpgsql("Host=localhost;Database=aa_design").Options);
}
