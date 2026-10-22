using Khazana.Catalog.Application;
using Wolverine;

namespace Khazana.Catalog.Api;

/// <summary>Daily: republish, which drops offers that expired (design doc §8.9). Waits for start, never throws.</summary>
public sealed partial class RepublishSweeper(
    IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, IConfiguration configuration, ILogger<RepublishSweeper> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Catalog:Sweeper:Enabled", defaultValue: true)) return;
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using (lifetime.ApplicationStarted.Register(() => started.TrySetResult()))
        using (stoppingToken.Register(() => started.TrySetCanceled(stoppingToken)))
        {
            try
            {
                await started.Task.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }

        using var timer = new PeriodicTimer(TimeSpan.FromDays(1));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync<PublishResult>(new PublishCatalog(), stoppingToken).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // a republish must never take the service down
            catch (Exception e)
#pragma warning restore CA1031
            {
                Failed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Daily catalog republish failed.")]
    private static partial void Failed(ILogger logger, Exception exception);
}
