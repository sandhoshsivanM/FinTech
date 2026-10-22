using Khazana.Sync.Application;
using Wolverine;

namespace Khazana.Sync.Api;

/// <summary>
/// Every six hours, drops tombstones older than the retention period
/// (<c>Sync:Sweeper:Enabled</c>, off in tests that control time themselves).
/// </summary>
/// <remarks>
/// Waits for the application to finish starting: Wolverine refuses messages
/// until its own host service is up, and a background service that throws
/// stops the whole host. A failed sweep is logged and retried next time,
/// never fatal.
/// </remarks>
public sealed partial class TombstoneSweeper(
    IServiceScopeFactory scopes, IConfiguration configuration, IHostApplicationLifetime lifetime, ILogger<TombstoneSweeper> log)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Sync:Sweeper:Enabled", defaultValue: true)) return;
        if (!await WaitForStartAsync(stoppingToken).ConfigureAwait(false)) return;

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new PurgeTombstones()).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // a sweep must never take the service down
            catch (Exception e)
#pragma warning restore CA1031
            {
                SweepFailed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    private async Task<bool> WaitForStartAsync(CancellationToken stoppingToken)
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var onStarted = lifetime.ApplicationStarted.Register(() => started.TrySetResult());
        using var onStopping = stoppingToken.Register(() => started.TrySetCanceled(stoppingToken));
        try
        {
            await started.Task.ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Tombstone sweep failed; retrying at the next interval.")]
    private static partial void SweepFailed(ILogger logger, Exception exception);
}
