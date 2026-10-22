using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Khazana.MarketData.Application.Persistence;

/// <summary>
/// Market Data's own database. No other service reads it — they ask through
/// the API or listen for events (design doc §7.3).
/// </summary>
public sealed class MarketDataDbContext(DbContextOptions<MarketDataDbContext> options) : DbContext(options)
{
    public const string Schema = "market";

    public DbSet<NavQuoteRow> NavQuotes => Set<NavQuoteRow>();
    public DbSet<NavFileRow> NavFiles => Set<NavFileRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<NavQuoteRow>(e =>
        {
            e.ToTable("nav_quotes");
            e.HasKey(x => new { x.SchemeCode, x.NavDate });
            e.Property(x => x.SchemeCode).HasColumnName("scheme_code").HasMaxLength(16);
            e.Property(x => x.NavDate).HasColumnName("nav_date");
            // numeric(18,4): AMFI publishes four decimal places. Never float.
            e.Property(x => x.Nav).HasColumnName("nav").HasPrecision(18, 4);
            e.Property(x => x.Isin).HasColumnName("isin").HasMaxLength(16);
            e.Property(x => x.SchemeName).HasColumnName("scheme_name").HasMaxLength(512);
            e.HasIndex(x => x.NavDate);
        });

        modelBuilder.Entity<NavFileRow>(e =>
        {
            e.ToTable("nav_files");
            e.HasKey(x => x.NavDate);
            e.Property(x => x.NavDate).HasColumnName("nav_date");
            e.Property(x => x.RowCount).HasColumnName("row_count");
            e.Property(x => x.Sha256).HasColumnName("sha256").HasMaxLength(64);
            e.Property(x => x.Gzip).HasColumnName("gzip");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        // Lets Wolverine write outgoing messages through this DbContext, in the
        // same transaction as the rows above (the transactional outbox).
        modelBuilder.MapWolverineEnvelopeStorage();
    }
}
