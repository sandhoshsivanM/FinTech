using Khazana.Identity.Domain;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Identity.Application.Persistence;

/// <summary>
/// Identity's own database (design doc §8.1). Personal fields are stored
/// encrypted, provider subjects and emails only as keyed hashes, refresh
/// tokens only as SHA-256 hashes. Nothing here can sign in as anyone.
/// </summary>
public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<UserRow> Users => Set<UserRow>();
    public DbSet<ExternalLoginRow> ExternalLogins => Set<ExternalLoginRow>();
    public DbSet<PasskeyRow> Passkeys => Set<PasskeyRow>();
    public DbSet<RefreshTokenRow> RefreshTokens => Set<RefreshTokenRow>();
    public DbSet<WebAuthnChallengeRow> WebAuthnChallenges => Set<WebAuthnChallengeRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("identity");

        modelBuilder.Entity<UserRow>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.DeleteRequestedAt).HasColumnName("delete_requested_at");
            e.Property(x => x.DisplayNameEnc).HasColumnName("display_name_enc");
            e.Property(x => x.EmailEnc).HasColumnName("email_enc");
            e.Property(x => x.EmailHash).HasColumnName("email_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.EmailHash);
        });

        modelBuilder.Entity<ExternalLoginRow>(e =>
        {
            e.ToTable("identities");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(16);
            e.Property(x => x.SubjectHash).HasColumnName("subject_hash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.Provider, x.SubjectHash }).IsUnique();
            e.HasOne<UserRow>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PasskeyRow>(e =>
        {
            e.ToTable("passkeys");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.CredentialId).HasColumnName("credential_id");
            e.Property(x => x.PublicKey).HasColumnName("public_key");
            e.Property(x => x.SignCount).HasColumnName("sign_count");
            e.Property(x => x.AaGuid).HasColumnName("aaguid");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.LastUsedAt).HasColumnName("last_used_at");
            e.HasIndex(x => x.CredentialId).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne<UserRow>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RefreshTokenRow>(e =>
        {
            e.ToTable("refresh_tokens");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.FamilyId).HasColumnName("family_id");
            e.Property(x => x.TokenHash).HasColumnName("token_hash");
            e.Property(x => x.Jkt).HasColumnName("dpop_jkt").HasMaxLength(64);
            e.Property(x => x.Platform).HasColumnName("platform").HasMaxLength(16);
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.UsedAt).HasColumnName("used_at");
            e.Property(x => x.RevokedAt).HasColumnName("revoked_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.FamilyId);
            e.HasIndex(x => x.UserId);
            e.HasOne<UserRow>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WebAuthnChallengeRow>(e =>
        {
            e.ToTable("webauthn_challenges");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(16);
            e.Property(x => x.OptionsJson).HasColumnName("options_json");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.UsedAt).HasColumnName("used_at");
            e.HasIndex(x => x.ExpiresAt);
        });
    }
}

public sealed class UserRow
{
    public Guid Id { get; set; }
    public AccountStatus Status { get; set; }
    public DateTimeOffset? DeleteRequestedAt { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public byte[]? DisplayNameEnc { get; set; }
    public byte[]? EmailEnc { get; set; }
    public byte[]? EmailHash { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>A Google or Apple account linked to a user, found by a keyed hash of its subject.</summary>
public sealed class ExternalLoginRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
#pragma warning disable CA1819
    public required byte[] SubjectHash { get; set; }
#pragma warning restore CA1819
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PasskeyRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
#pragma warning disable CA1819
    public required byte[] CredentialId { get; set; }
    public required byte[] PublicKey { get; set; }
#pragma warning restore CA1819
    public long SignCount { get; set; }
    public Guid AaGuid { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
}

/// <summary>
/// One refresh token. Tokens of one sign-in share a <see cref="FamilyId"/>, so
/// a reused token can end the whole session at once.
/// </summary>
public sealed class RefreshTokenRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DeviceId { get; set; }
    public Guid FamilyId { get; set; }
#pragma warning disable CA1819
    public required byte[] TokenHash { get; set; }
#pragma warning restore CA1819
    public required string Jkt { get; set; }
    public required string Platform { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A WebAuthn challenge: single use, five minutes.</summary>
public sealed class WebAuthnChallengeRow
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public required string Kind { get; set; }
    public required string OptionsJson { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}
