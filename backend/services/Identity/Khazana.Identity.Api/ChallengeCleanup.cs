using Khazana.Identity.Application;

namespace Khazana.Identity.Api;

/// <summary>
/// Hourly: deletes expired WebAuthn challenges. Anyone may ask for sign-in
/// options, so without this the table only ever grows. Waits for start, never throws.
/// </summary>
public sealed partial class ChallengeCleanup(IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, ILogger<ChallengeCleanup> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
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

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<PasskeyService>().DeleteExpiredChallengesAsync(stoppingToken).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // housekeeping must never take the service down
            catch (Exception e)
#pragma warning restore CA1031
            {
                Failed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "WebAuthn challenge cleanup failed.")]
    private static partial void Failed(ILogger logger, Exception exception);
}
