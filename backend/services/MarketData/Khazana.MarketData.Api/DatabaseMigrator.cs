using Khazana.MarketData.Application.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Khazana.MarketData.Api;

/// <summary>
/// Applies EF Core migrations at startup when <c>Database:MigrateOnStartup</c>
/// is true (development and tests). In the cloud, migrations run as a separate
/// deployment step, so several instances starting at once never race to
/// change the schema.
/// </summary>
public sealed class DatabaseMigrator(IServiceProvider services, IConfiguration configuration) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue("Database:MigrateOnStartup", defaultValue: false)) return;
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MarketDataDbContext>();
        await db.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
