using Khazana.MarketData.Application.Ingest;
using Khazana.SharedKernel;
using Wolverine;

namespace Khazana.MarketData.Api;

/// <summary>
/// Queues <see cref="IngestNav"/> once a day at 23:30 IST, after AMFI has
/// published the evening's NAVs. Sent through Wolverine's durable local queue,
/// so a crash mid-ingest is retried rather than lost.
/// </summary>
/// <remarks>
/// A hosted service is a singleton, but Wolverine's <see cref="IMessageBus"/> is
/// scoped, so the scheduler takes a scope factory and opens a fresh scope per
/// run. Injecting the bus directly would hold one scoped bus for the app's
/// whole lifetime — a captive dependency, refused by DI validation at startup.
/// </remarks>
public sealed partial class NavIngestScheduler(
    IServiceScopeFactory scopes, IClock clock, IConfiguration configuration, ILogger<NavIngestScheduler> logger)
    : BackgroundService
{
    public static readonly TimeOnly RunAtIst = new(23, 30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Market:Scheduler:Enabled", defaultValue: true)) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = clock.UtcNow;
            var next = NextRunAfter(now);
            LogNextRun(logger, next);
            await Task.Delay(next - now, stoppingToken).ConfigureAwait(false);
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<IMessageBus>()
                .SendAsync(new IngestNav()).ConfigureAwait(false);
        }
    }

    /// <summary>The next 23:30 IST strictly after <paramref name="now"/>.</summary>
    public static DateTimeOffset NextRunAfter(DateTimeOffset now)
    {
        var ist = IndiaTime.ToIst(now);
        var today = new DateTimeOffset(DateOnly.FromDateTime(ist.DateTime).ToDateTime(RunAtIst), IndiaTime.Offset);
        return today > now ? today : today.AddDays(1);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Next NAV ingest at {Next}")]
    private static partial void LogNextRun(ILogger logger, DateTimeOffset next);
}
