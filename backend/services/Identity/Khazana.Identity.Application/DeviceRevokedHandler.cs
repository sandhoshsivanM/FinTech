using Khazana.Messaging.Contracts;

namespace Khazana.Identity.Application;

/// <summary>
/// A device was logged out remotely (Devices & Keys): end its sessions here
/// too, so its refresh token stops working at once. Its last access token
/// lapses within 15 minutes, and Devices & Keys and Sync already refuse it.
/// </summary>
public static class DeviceRevokedHandler
{
    public static Task Handle(DeviceRevokedV1 message, SessionService sessions, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(sessions);
        return sessions.LogoutAsync(message.UserId, message.DeviceId, everywhere: false, ct);
    }
}
