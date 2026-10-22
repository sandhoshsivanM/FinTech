using Khazana.AuditReporting.Application.Persistence;
using Khazana.AuditReporting.Domain;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.AuditReporting.Application;

public sealed record DayCount(DateOnly Day, int Count);

public sealed record Metrics(
    int TotalUsers, int Active7Days, int Active30Days, int PendingDeletions,
    IReadOnlyList<DayCount> SignupsByDay, IReadOnlyList<DayCount> SigninsByDay, IReadOnlyDictionary<string, int> UsersByPlatform);

public sealed record DirectoryEntry(Guid UserId, DateTimeOffset RegisteredAt, DateTimeOffset LastActiveAt,
    IReadOnlyList<string> Platforms, int DeviceCount, string Status);

public sealed record Signin(Guid DeviceId, string Platform, DateTimeOffset At);

public sealed record UserDetail(DirectoryEntry Entry, IReadOnlyList<Signin> RecentSignins);

public sealed record AuditView(long Id, DateTimeOffset At, string Actor, string Action, string Target, string? Reason);

public sealed record Paged<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public sealed record ChainStatus(bool Intact, long Records, long? FirstBrokenId);

/// <summary>What the admin app may ask. Every answer is ids, counts and times.</summary>
public sealed class AdminQueries(ReportingDbContext db, IClock clock)
{
    public const int MaxPageSize = 100;

    public async Task<Metrics> MetricsAsync(int days, CancellationToken ct)
    {
        days = Math.Clamp(days, 1, 365);
        var now = clock.UtcNow;
        var since = now.AddDays(-days);

        var total = await db.Directory.CountAsync(ct).ConfigureAwait(false);
        var active7 = await db.Directory.CountAsync(d => d.LastActiveAt >= now.AddDays(-7), ct).ConfigureAwait(false);
        var active30 = await db.Directory.CountAsync(d => d.LastActiveAt >= now.AddDays(-30), ct).ConfigureAwait(false);
        var pending = await db.Directory.CountAsync(d => d.Status == DirectoryStatus.DeletionRequested, ct).ConfigureAwait(false);

        var signups = await db.Directory.Where(d => d.RegisteredAt >= since)
            .Select(d => d.RegisteredAt).ToListAsync(ct).ConfigureAwait(false);
        var signins = await db.SigninEvents.Where(s => s.At >= since)
            .Select(s => s.At).ToListAsync(ct).ConfigureAwait(false);
        var platforms = await db.Directory.Select(d => d.Platforms).ToListAsync(ct).ConfigureAwait(false);

        return new Metrics(total, active7, active30, pending,
            ByDay(signups), ByDay(signins),
            platforms.SelectMany(p => p).GroupBy(p => p, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal));
    }

    public async Task<Paged<DirectoryEntry>> UsersAsync(int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var total = await db.Directory.CountAsync(ct).ConfigureAwait(false);
        var rows = await db.Directory.AsNoTracking().OrderByDescending(d => d.RegisteredAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct).ConfigureAwait(false);
        return new Paged<DirectoryEntry>([.. rows.Select(ToEntry)], page, pageSize, total);
    }

    public async Task<UserDetail?> UserAsync(Guid userId, CancellationToken ct)
    {
        var row = await db.Directory.AsNoTracking().FirstOrDefaultAsync(d => d.UserId == userId, ct).ConfigureAwait(false);
        if (row is null) return null;
        var signins = await db.SigninEvents.AsNoTracking().Where(s => s.UserId == userId)
            .OrderByDescending(s => s.At).Take(50)
            .Select(s => new Signin(s.DeviceId, s.Platform, s.At)).ToListAsync(ct).ConfigureAwait(false);
        return new UserDetail(ToEntry(row), signins);
    }

    public async Task<Paged<AuditView>> AuditAsync(int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var total = await db.AuditEvents.CountAsync(ct).ConfigureAwait(false);
        var rows = await db.AuditEvents.AsNoTracking().OrderByDescending(a => a.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new AuditView(a.Id, a.At, a.Actor, a.Action, a.Target, a.Reason)).ToListAsync(ct).ConfigureAwait(false);
        return new Paged<AuditView>(rows, page, pageSize, total);
    }

    /// <summary>Re-checks the whole hash chain, oldest first. O(n); run on demand, not per page view.</summary>
    public async Task<ChainStatus> VerifyChainAsync(CancellationToken ct)
    {
        var rows = await db.AuditEvents.AsNoTracking().OrderBy(a => a.Id).ToListAsync(ct).ConfigureAwait(false);
        var broken = AuditChain.FirstBrokenLink([.. rows.Select(r =>
            (r.PreviousHash, r.Hash, new AuditEntry(r.At, r.Actor, r.Action, r.Target, r.Reason)))]);
        return new ChainStatus(broken is null, rows.Count, broken is { } i ? rows[i].Id : null);
    }

    private static DirectoryEntry ToEntry(DirectoryRow d) =>
        new(d.UserId, d.RegisteredAt, d.LastActiveAt, d.Platforms, d.DeviceCount, d.Status);

    private static List<DayCount> ByDay(IEnumerable<DateTimeOffset> times) =>
        [.. times.GroupBy(t => DateOnly.FromDateTime(IndiaTime.ToIst(t).DateTime)).OrderBy(g => g.Key).Select(g => new DayCount(g.Key, g.Count()))];
}
