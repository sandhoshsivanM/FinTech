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
/// Deleting last means the user can still be told what is happening (and the
/// request can't be "lost") until every copy of their data is gone. Duplicate
/// or late confirmations are harmless. A service that never answers leaves the
/// saga open; <c>DeletionOverdueCheck</c> reports it so a person can act within
/// the DPDP deadline.
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

        var request = await db.DeletionRequests.FirstOrDefaultAsync(r => r.UserId == message.UserId, ct).ConfigureAwait(false);
        // No request (stray message) or already finished: nothing to do.
        if (request is null || request.CompletedAt is not null) return [];

        if (!await db.DeletionConfirmations.AnyAsync(c => c.UserId == message.UserId && c.Service == message.Service, ct).ConfigureAwait(false))
        {
            db.DeletionConfirmations.Add(new DeletionConfirmationRow { UserId = message.UserId, Service = message.Service, ConfirmedAt = message.At });
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
        }

        var confirmed = await db.DeletionConfirmations.Where(c => c.UserId == message.UserId)
            .Select(c => c.Service).ToListAsync(ct).ConfigureAwait(false);
        if (settings.Services.Except(confirmed, StringComparer.Ordinal).Any()) return [];

        // Every service is done. Identity goes last: the user row cascades to
        // identities, passkeys and refresh tokens.
        var now = clock.UtcNow;
        await db.Users.Where(u => u.Id == message.UserId && u.Status == AccountStatus.DeletionRequested)
            .ExecuteDeleteAsync(ct).ConfigureAwait(false);
        request.CompletedAt = now;
        return [new AccountDeletedV1(message.UserId, now)];
    }
}
