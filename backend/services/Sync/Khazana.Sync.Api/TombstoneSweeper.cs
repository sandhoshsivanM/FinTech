using Khazana.Sync.Application;
using Wolverine;

namespace Khazana.Sync.Api;

/// <summary>
/// Every six hours, drops tombstones older than the retention period
/// (<c>Sync:Sweeper:Enabled</c>, off in tests that control time themselves).
/// </summary>
public sealed class TombstoneSweeper(IServiceScopeFactory scopes, IConfiguration configuration) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Sync:Sweeper:Enabled", defaultValue: true)) return;
        using var timer = new PeriodicTimer(Interval);
        do
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new PurgeTombstones()).ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
