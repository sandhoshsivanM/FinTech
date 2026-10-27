using Khazana.AccountAggregator.Application;
using Wolverine;

namespace Khazana.AccountAggregator.Api;

/// <summary>
/// Hourly (design doc §8.9): consent expiry, unapproved requests, inbox
/// retention and scheduled fetches (<c>Aa:Sweeper:Enabled</c>, off in tests
/// that control time themselves).
/// </summary>
/// <remarks>
/// Waits for the application to finish starting: Wolverine refuses messages
/// until its own host service is up, and a background service that throws
/// stops the whole host. A failed sweep is logged and retried next time.
/// </remarks>
public sealed partial class MaintenanceSweeper(
    IServiceScopeFactory scopes, IConfiguration configuration, IHostApplicationLifetime lifetime, ILogger<MaintenanceSweeper> log)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Aa:Sweeper:Enabled", defaultValue: true)) return;
        if (!await WaitForStartAsync(stoppingToken).ConfigureAwait(false)) return;

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new RunAaMaintenance()).ConfigureAwait(false);
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

    [LoggerMessage(Level = LogLevel.Error, Message = "AA maintenance sweep failed; retrying at the next interval.")]
    private static partial void SweepFailed(ILogger logger, Exception exception);
}
