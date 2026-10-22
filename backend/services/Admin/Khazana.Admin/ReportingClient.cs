using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;

namespace Khazana.Admin;

// The shapes Audit & Reporting returns. Ids, counts and times: there is no
// field here that could hold a name, an email or an amount.

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

/// <summary>The audit write failed, so the page must not show anything.</summary>
public sealed class AuditUnavailableException : Exception
{
    public AuditUnavailableException() : base("The audit log could not record this view.") { }
    public AuditUnavailableException(string message) : base(message) { }
    public AuditUnavailableException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>
/// Talks to Audit & Reporting with the internal service key. Every read is
/// preceded by an audit record of who is looking at what; if that record
/// can't be written, the read doesn't happen (fail closed).
/// </summary>
public sealed class ReportingClient(HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public async Task<Metrics> MetricsAsync(ClaimsPrincipal admin, CancellationToken ct)
    {
        await AuditAsync(admin, "admin.view.dashboard", "page:dashboard", ct).ConfigureAwait(false);
        return (await http.GetFromJsonAsync<Metrics>("internal/admin/metrics?days=30", Json, ct).ConfigureAwait(false))!;
    }

    public async Task<Paged<DirectoryEntry>> UsersAsync(ClaimsPrincipal admin, int page, CancellationToken ct)
    {
        await AuditAsync(admin, "admin.view.users", $"page:users:{page}", ct).ConfigureAwait(false);
        return (await http.GetFromJsonAsync<Paged<DirectoryEntry>>($"internal/admin/users?page={page}&size=25", Json, ct).ConfigureAwait(false))!;
    }

    public async Task<UserDetail?> UserAsync(ClaimsPrincipal admin, Guid id, CancellationToken ct)
    {
        await AuditAsync(admin, "admin.view.user", $"user:{id}", ct).ConfigureAwait(false);
        using var response = await http.GetAsync(new Uri($"internal/admin/users/{id}", UriKind.Relative), ct).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<UserDetail>(Json, ct).ConfigureAwait(false);
    }

    public async Task<(Paged<AuditView> Page, ChainStatus? Chain)> AuditLogAsync(ClaimsPrincipal admin, int page, bool verify, CancellationToken ct)
    {
        await AuditAsync(admin, verify ? "admin.verify.audit" : "admin.view.audit", $"page:audit:{page}", ct).ConfigureAwait(false);
        var items = (await http.GetFromJsonAsync<Paged<AuditView>>($"internal/admin/audit?page={page}&size=50", Json, ct).ConfigureAwait(false))!;
        var chain = verify ? await http.GetFromJsonAsync<ChainStatus>("internal/admin/audit/verify", Json, ct).ConfigureAwait(false) : null;
        return (items, chain);
    }

    /// <summary>
    /// <c>admin:&lt;sub&gt;</c>: the provider's stable subject, which every
    /// provider sends and which never changes. Emails can contain characters the
    /// audit format refuses (that locked an admin out), and can change hands.
    /// A subject that doesn't fit the format is recorded as a short hash.
    /// </summary>
    public static string Actor(ClaimsPrincipal admin)
    {
        ArgumentNullException.ThrowIfNull(admin);
        var sub = admin.FindFirstValue("sub") ?? throw new AuditUnavailableException("Signed-in admin has no subject.");
        var safe = sub.Length <= 128 && sub.All(c => char.IsAsciiLetterOrDigit(c) || c is '@' or '.' or '_' or '+' or '-');
        return "admin:" + (safe ? sub : Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(sub)))[..32].ToLowerInvariant());
    }

    private async Task AuditAsync(ClaimsPrincipal admin, string action, string target, CancellationToken ct)
    {
        try
        {
            using var response = await http.PostAsJsonAsync("internal/admin/audit",
                new { Actor = Actor(admin), Action = action, Target = target }, Json, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) throw new AuditUnavailableException($"Audit refused: {(int)response.StatusCode}.");
        }
        catch (HttpRequestException e)
        {
            throw new AuditUnavailableException("Audit & Reporting unreachable.", e);
        }
    }
}
