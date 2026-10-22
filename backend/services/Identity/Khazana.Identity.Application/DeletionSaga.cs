using Khazana.Identity.Application.Persistence;
using Khazana.Identity.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Identity.Application;

/// <summary>The services that hold a user's data and must confirm before Identity deletes the user.</summary>
public sealed record DeletionSettings(IReadOnlyList<string> Services);

/// <summary>
/// The account-deletion saga (design doc §8.5), orchestrated here.
/// <see cref="AccountDeletionRequestedV1"/> goes out with the request; each
/// service deletes after the cooling-off and answers with
/// <see cref="UserDataPurgedV1"/>. When every expected service has answered,
/// Identity deletes the user last and announces <see cref="AccountDeletedV1"/>.
/// </summary>
/// <remarks>
/// The services all purge at the same moment, so their confirmations arrive
/// together. Each handler first locks the deletion request row: confirmations
/// for one user are then counted one at a time, the last one sees all the
/// others, and the guarded completion lets exactly one handler delete the user
/// and announce it. (Without the lock, two concurrent last confirmations could
/// each miss the other's row and the deletion would never finish.) Duplicate,
/// late or cancelled confirmations change nothing. A service that never
/// answers leaves the saga open; <c>DeletionOverdueCheck</c> reports it.
/// </remarks>
public static class UserDataPurgedHandler
{
    public static async Task<object[]> Handle(
        UserDataPurgedV1 message, IdentityDbContext db, DeletionSettings settings, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(clock);

        var request = (await db.DeletionRequests
            .FromSql($"SELECT * FROM identity.deletion_requests WHERE user_id = {message.UserId} FOR UPDATE")
            .ToListAsync(ct).ConfigureAwait(false)).SingleOrDefault();
        // No request (stray or cancelled) or already finished: nothing to do.
        if (request is null || request.CompletedAt is not null) return [];

        await db.Database.ExecuteSqlAsync($"""
            INSERT INTO identity.deletion_confirmations (user_id, service, confirmed_at)
            VALUES ({message.UserId}, {message.Service}, {message.At})
            ON CONFLICT DO NOTHING
            """, ct).ConfigureAwait(false);

        var confirmed = await db.DeletionConfirmations.Where(c => c.UserId == message.UserId)
            .Select(c => c.Service).ToListAsync(ct).ConfigureAwait(false);
        if (settings.Services.Except(confirmed, StringComparer.Ordinal).Any()) return [];

        // Every service is done. Complete once, then Identity goes last: the
        // user row cascades to logins, passkeys, sessions and refresh tokens.
        var now = clock.UtcNow;
        var completed = await db.DeletionRequests
            .Where(r => r.UserId == message.UserId && r.CompletedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.CompletedAt, now), ct).ConfigureAwait(false);
        if (completed != 1) return [];
        await db.Users.Where(u => u.Id == message.UserId && u.Status == AccountStatus.DeletionRequested)
            .ExecuteDeleteAsync(ct).ConfigureAwait(false);
        return [new AccountDeletedV1(message.UserId, now)];
    }
}
