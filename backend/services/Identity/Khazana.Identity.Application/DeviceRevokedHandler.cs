using Khazana.Identity.Application.Persistence;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Identity.Application;

/// <summary>
/// A device was logged out remotely (Devices & Keys): end its sessions here
/// too, so its refresh token stops working at once. Its last access token
/// lapses within 15 minutes, and Devices & Keys and Sync already refuse it.
/// </summary>
/// <remarks>
/// Runs inside Wolverine's transaction, so it updates directly rather than
/// through <see cref="SessionService.LogoutAsync"/>, which opens its own. The
/// session rows go first, so a refresh holding one is waited for. No
/// <see cref="SessionEndedV1"/> goes back: Devices & Keys started this.
/// </remarks>
public static class DeviceRevokedHandler
{
    public static async Task Handle(DeviceRevokedV1 message, IdentityDbContext db, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);
        var now = clock.UtcNow;
        await db.Sessions.Where(s => s.UserId == message.UserId && s.DeviceId == message.DeviceId && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct).ConfigureAwait(false);
        await db.RefreshTokens.Where(t => t.UserId == message.UserId && t.DeviceId == message.DeviceId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct).ConfigureAwait(false);
    }
}
