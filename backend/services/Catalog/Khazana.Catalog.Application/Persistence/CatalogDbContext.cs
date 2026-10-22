using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Catalog.Application.Persistence;

/// <summary>Catalog's own database (design doc §8.1): public, curated data only.</summary>
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<OfferRow> Offers => Set<OfferRow>();
    public DbSet<TemplateRow> Templates => Set<TemplateRow>();
    public DbSet<CatalogVersionRow> Versions => Set<CatalogVersionRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("catalog");
        modelBuilder.Entity<OfferRow>(e =>
        {
            e.ToTable("offers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(64);
            e.Property(x => x.Document).HasColumnName("doc").HasColumnType("jsonb");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });
        modelBuilder.Entity<TemplateRow>(e =>
        {
            e.ToTable("parser_templates");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(64);
            e.Property(x => x.Document).HasColumnName("doc").HasColumnType("jsonb");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });
        modelBuilder.Entity<CatalogVersionRow>(e =>
        {
            e.ToTable("catalog_versions");
            e.HasKey(x => x.Version);
            e.Property(x => x.Version).HasColumnName("version").ValueGeneratedNever();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.ContentChecksum).HasColumnName("content_checksum");
            e.Property(x => x.KeyId).HasColumnName("key_id").HasMaxLength(32);
            e.Property(x => x.Signature).HasColumnName("signature");
            e.Property(x => x.Payload).HasColumnName("payload");
        });
    }
}

public sealed class OfferRow
{
    public required string Id { get; set; }
    public required string Document { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class TemplateRow
{
    public required string Id { get; set; }
    public required string Document { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>One published, signed catalog. Kept, so any version can be re-served or audited.</summary>
public sealed class CatalogVersionRow
{
    public long Version { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
#pragma warning disable CA1819 // byte[] columns are how EF maps bytea
    public required byte[] ContentChecksum { get; set; }
    public required string KeyId { get; set; }
    public required byte[] Signature { get; set; }
    public required byte[] Payload { get; set; }
#pragma warning restore CA1819
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<CatalogDbContext>().UseNpgsql("Host=localhost;Database=catalog_design").Options);
}
