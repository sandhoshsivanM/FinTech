using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Notification.Application.Persistence;

/// <summary>
/// Notification's own database (design doc §8.1): one push token per device.
/// Email comes later and needs Identity's help, since only Identity holds
/// (encrypted) addresses.
/// </summary>
public sealed class NotificationDbContext(DbContextOptions<NotificationDbContext> options) : DbContext(options)
{
    public DbSet<PushTokenRow> PushTokens => Set<PushTokenRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema("notification");
        modelBuilder.Entity<PushTokenRow>(e =>
        {
            e.ToTable("push_tokens");
            e.HasKey(x => x.DeviceId);
            e.Property(x => x.DeviceId).HasColumnName("device_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(16);
            e.Property(x => x.Token).HasColumnName("token").HasMaxLength(4096);
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.UserId);
        });
    }
}

public sealed class PushTokenRow
{
    public Guid DeviceId { get; set; }
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public required string Token { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>For <c>dotnet ef migrations add</c> only; the connection is never opened.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<NotificationDbContext>
{
    public NotificationDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<NotificationDbContext>().UseNpgsql("Host=localhost;Database=notification_design").Options);
}
