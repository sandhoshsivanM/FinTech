using Khazana.Catalog.Application;
using Wolverine;

namespace Khazana.Catalog.Api;

/// <summary>
/// Republish at startup and then just after every midnight IST, so an offer
/// that ended yesterday leaves the catalog as the day turns (design doc §8.9).
/// Waits for start, never throws.
/// </summary>
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

        while (!stoppingToken.IsCancellationRequested)
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
            try
            {
                await Task.Delay(UntilNextIstMidnight(DateTimeOffset.UtcNow), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>Time until a minute past the next midnight in India.</summary>
    public static TimeSpan UntilNextIstMidnight(DateTimeOffset now)
    {
        var ist = Khazana.SharedKernel.IndiaTime.ToIst(now);
        var next = new DateTimeOffset(ist.Date.AddDays(1).AddMinutes(1), Khazana.SharedKernel.IndiaTime.Offset);
        return next - now;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Daily catalog republish failed.")]
    private static partial void Failed(ILogger logger, Exception exception);
}
