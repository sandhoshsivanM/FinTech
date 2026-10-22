using Khazana.Identity.Application;
using Khazana.Identity.Application.Persistence;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Identity.Api;

/// <summary>
/// Once a day, finds account deletions still open a week after their
/// cooling-off ended, and logs which services have not confirmed. The DPDP Act
/// expects deletion within a reasonable time; the design commits to 30 days,
/// so a week's silence is when a person needs to look.
/// </summary>
/// <remarks>Waits for application start and never throws, like every background job here.</remarks>
public sealed partial class DeletionOverdueCheck(
    IServiceScopeFactory scopes, IHostApplicationLifetime lifetime, ILogger<DeletionOverdueCheck> log) : BackgroundService
{
    public static readonly TimeSpan Grace = TimeSpan.FromDays(7);

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

        using var timer = new PeriodicTimer(TimeSpan.FromDays(1));
        do
        {
            try
            {
                await CheckAsync(stoppingToken).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // a report must never take the service down
            catch (Exception e)
#pragma warning restore CA1031
            {
                CheckFailed(log, e);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }

    /// <summary>The overdue deletions and their missing services; public for tests.</summary>
    public static async Task<IReadOnlyList<(Guid UserId, string[] Missing)>> FindOverdueAsync(
        IdentityDbContext db, DeletionSettings settings, DateTimeOffset now, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(settings);
        var cutoff = now - Grace;
        var open = await db.DeletionRequests.AsNoTracking()
            .Where(r => r.CompletedAt == null && r.ExecuteAfter < cutoff)
            .Select(r => r.UserId).ToListAsync(ct).ConfigureAwait(false);
        var result = new List<(Guid, string[])>();
        foreach (var user in open)
        {
            var confirmed = await db.DeletionConfirmations.Where(c => c.UserId == user)
                .Select(c => c.Service).ToListAsync(ct).ConfigureAwait(false);
            result.Add((user, settings.Services.Except(confirmed, StringComparer.Ordinal).ToArray()));
        }
        return result;
    }

    private async Task CheckAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var overdue = await FindOverdueAsync(
            scope.ServiceProvider.GetRequiredService<IdentityDbContext>(),
            scope.ServiceProvider.GetRequiredService<DeletionSettings>(),
            scope.ServiceProvider.GetRequiredService<IClock>().UtcNow, ct).ConfigureAwait(false);
        foreach (var (user, missing) in overdue) Overdue(log, user, string.Join(", ", missing));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Account deletion for {UserId} is overdue; waiting on: {Services}.")]
    private static partial void Overdue(ILogger logger, Guid userId, string services);

    [LoggerMessage(Level = LogLevel.Error, Message = "Deletion overdue check failed.")]
    private static partial void CheckFailed(ILogger logger, Exception exception);
}
