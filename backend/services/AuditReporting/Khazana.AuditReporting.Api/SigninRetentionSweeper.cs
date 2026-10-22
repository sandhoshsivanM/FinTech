using Khazana.AuditReporting.Application;
using Wolverine;

namespace Khazana.AuditReporting.Api;

/// <summary>Daily: drop sign-in history older than 180 days. Waits for start, never throws.</summary>
public sealed partial class SigninRetentionSweeper(
    IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, IConfiguration configuration, ILogger<SigninRetentionSweeper> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Reporting:Sweeper:Enabled", defaultValue: true)) return;
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
                await scope.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new PurgeOldSignins()).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // a sweep must never take the service down
            catch (Exception e)
#pragma warning restore CA1031
            {
                Failed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Sign-in retention sweep failed.")]
    private static partial void Failed(ILogger logger, Exception exception);
}
