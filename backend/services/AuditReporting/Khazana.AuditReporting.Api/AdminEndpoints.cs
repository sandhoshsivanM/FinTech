using System.Security.Cryptography;
using System.Text;
using Khazana.AuditReporting.Application;
using Khazana.AuditReporting.Domain;
using Khazana.SharedKernel;

namespace Khazana.AuditReporting.Api;

public sealed record AdminAction(string Actor, string Action, string Target, string? Reason);

/// <summary>
/// The admin app's only door into any data (design doc §8.10). Never routed
/// through the public gateway, and every call needs the internal service key.
/// </summary>
public static class AdminEndpoints
{
    public const string KeyHeader = "X-Khazana-Internal-Key";

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/internal/admin").AddEndpointFilter(RequireServiceKey);
        admin.MapGet("/metrics", async (int? days, AdminQueries q, CancellationToken ct) =>
            Results.Ok(await q.MetricsAsync(days ?? 30, ct).ConfigureAwait(false)));
        admin.MapGet("/users", async (int? page, int? size, AdminQueries q, CancellationToken ct) =>
            Results.Ok(await q.UsersAsync(page ?? 1, size ?? 25, ct).ConfigureAwait(false)));
        admin.MapGet("/users/{id:guid}", async (Guid id, AdminQueries q, CancellationToken ct) =>
            await q.UserAsync(id, ct).ConfigureAwait(false) is { } user ? Results.Ok(user) : Results.NotFound());
        admin.MapGet("/audit", async (int? page, int? size, AdminQueries q, CancellationToken ct) =>
            Results.Ok(await q.AuditAsync(page ?? 1, size ?? 50, ct).ConfigureAwait(false)));
        admin.MapGet("/audit/verify", async (AdminQueries q, CancellationToken ct) =>
            Results.Ok(await q.VerifyChainAsync(ct).ConfigureAwait(false)));
        admin.MapPost("/audit", RecordAdminAction);
    }

    /// <summary>The admin app records every view and action here, before showing anything.</summary>
    private static async Task<IResult> RecordAdminAction(
        AdminAction body, Application.Persistence.ReportingDbContext db, AuditWriter audit, IClock clock, CancellationToken ct)
    {
        var entry = new AuditEntry(clock.UtcNow, body.Actor, body.Action, body.Target, body.Reason);
        if (!entry.Actor.StartsWith("admin:", StringComparison.Ordinal) || !ReportingRules.IsValid(entry))
            return Results.BadRequest();
        await using var tx = await db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        await audit.AppendAsync(entry, ct).ConfigureAwait(false);
        await tx.CommitAsync(ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    /// <summary>
    /// Constant-time comparison against the key from the secret store. A
    /// stand-in for the design's client-credentials token plus mTLS between
    /// services (§14.2), which arrives with the cloud slice.
    /// </summary>
    private static ValueTask<object?> RequireServiceKey(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = http.RequestServices.GetRequiredService<InternalKey>().Bytes;
        var presented = Encoding.UTF8.GetBytes(http.Request.Headers[KeyHeader].ToString());
        // Hash both so lengths match and the comparison takes the same time either way.
        return CryptographicOperations.FixedTimeEquals(SHA256.HashData(presented), SHA256.HashData(expected))
            ? next(context)
            : ValueTask.FromResult<object?>(Results.Unauthorized());
    }
}

/// <summary>The internal service key, validated at startup.</summary>
public sealed class InternalKey
{
    public const int MinLength = 32;

    public InternalKey(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length < MinLength)
            throw new InvalidOperationException($"Reporting:InternalKey must be at least {MinLength} characters.");
        Bytes = Encoding.UTF8.GetBytes(value);
    }

    public byte[] Bytes { get; }
}
