using System.Security.Cryptography;
using System.Text;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Khazana.Notification.Application.Persistence;
using Khazana.Notification.Domain;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Khazana.Notification.Application;

public enum PushOutcome
{
    Delivered,

    /// <summary>The provider says the token is dead (app uninstalled, token rotated): forget it.</summary>
    TokenInvalid,

    /// <summary>Transient; the next event will try again.</summary>
    Failed,
}

/// <summary>One push provider (FCM, APNs, or the development log).</summary>
public interface IPushSender
{
    string Provider { get; }

    Task<PushOutcome> SendAsync(string token, PushMessage message, CancellationToken ct);
}

/// <summary>Sends one message to a set of devices and forgets dead tokens.</summary>
/// <remarks>
/// Best effort by design: a push only prompts the app, which also syncs and
/// checks its devices whenever it opens. A failure is logged, not retried, so a
/// provider outage can't pile up duplicate alerts.
/// </remarks>
public sealed partial class PushDispatcher(IEnumerable<IPushSender> senders, NotificationDbContext db, ILogger<PushDispatcher> log)
{
    private readonly Dictionary<string, IPushSender> _senders = senders.ToDictionary(s => s.Provider, StringComparer.Ordinal);

    public async Task SendAsync(Guid userId, Guid? exceptDevice, PushMessage message, CancellationToken ct)
    {
        var tokens = await db.PushTokens
            .Where(t => t.UserId == userId && (exceptDevice == null || t.DeviceId != exceptDevice))
            .ToListAsync(ct).ConfigureAwait(false);

        foreach (var row in tokens)
        {
            if (!_senders.TryGetValue(row.Provider, out var sender))
            {
                NoSender(log, row.Provider);
                continue;
            }
            PushOutcome outcome;
            try
            {
                outcome = await sender.SendAsync(row.Token, message, ct).ConfigureAwait(false);
            }
#pragma warning disable CA1031 // one provider's outage must not stop the others or undo the cleanup
            catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested)
#pragma warning restore CA1031
            {
                SendThrew(log, row.Provider, e);
                outcome = PushOutcome.Failed;
            }
            if (outcome == PushOutcome.TokenInvalid) db.PushTokens.Remove(row);
            else if (outcome == PushOutcome.Failed) SendFailed(log, row.Provider, TokenTag(row.Token));
        }
    }

    /// <summary>A short hash to correlate log lines with a token without logging the token.</summary>
    public static string TokenTag(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)))[..12];

    [LoggerMessage(Level = LogLevel.Information, Message = "No push sender configured for {Provider}; skipped.")]
    private static partial void NoSender(ILogger logger, string provider);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push via {Provider} threw; continuing with the others.")]
    private static partial void SendThrew(ILogger logger, string provider, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push via {Provider} to token {TokenTag} failed.")]
    private static partial void SendFailed(ILogger logger, string provider, string tokenTag);
}

/// <summary>Push-token registration for the calling device.</summary>
public sealed class PushRegistrationService(NotificationDbContext db, IClock clock)
{
    /// <returns>False when provider or token is malformed.</returns>
    public async Task<bool> RegisterAsync(Guid userId, Guid deviceId, string provider, string token, CancellationToken ct)
    {
        if (!PushProviders.IsValid(provider, token)) return false;
        if (await db.RevokedDevices.AnyAsync(d => d.DeviceId == deviceId, ct).ConfigureAwait(false)) return false;
        // A token belongs to one install. If another device row (an old
        // session on this phone, or another user who signed in on it) holds
        // it, that row goes, or its alerts would reach whoever holds the phone now.
        await db.PushTokens.Where(t => t.Token == token && t.DeviceId != deviceId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        var row = await db.PushTokens.FirstOrDefaultAsync(t => t.DeviceId == deviceId, ct).ConfigureAwait(false);
        if (row is null)
        {
            db.PushTokens.Add(new PushTokenRow { DeviceId = deviceId, UserId = userId, Provider = provider, Token = token, UpdatedAt = clock.UtcNow });
        }
        else
        {
            // A device id belongs to one user for life; never re-point it.
            if (row.UserId != userId) return false;
            row.Provider = provider;
            row.Token = token;
            row.UpdatedAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return true;
    }

    public Task<int> UnregisterAsync(Guid userId, Guid deviceId, CancellationToken ct) =>
        db.PushTokens.Where(t => t.DeviceId == deviceId && t.UserId == userId).ExecuteDeleteAsync(ct);
}

/// <summary>Another device pushed records: tell the user's other devices to sync. No data in the push.</summary>
public static class RecordsPushedHandler
{
    public static Task Handle(RecordsPushedV1 message, PushDispatcher dispatcher, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(dispatcher);
        return dispatcher.SendAsync(message.UserId, message.FromDeviceId, PushContent.SyncNudge, ct);
    }
}

/// <summary>A device was added: alert every other device (design doc §14.3, new-device alerts).</summary>
public static class DeviceAddedHandler
{
    public static Task Handle(DeviceAddedV1 message, PushDispatcher dispatcher, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(dispatcher);
        return dispatcher.SendAsync(message.UserId, message.DeviceId, PushContent.NewDevice(message.Platform), ct);
    }
}

/// <summary>A revoked device gets no more pushes.</summary>
public static class DeviceRevokedHandler
{
    public static async Task Handle(DeviceRevokedV1 message, NotificationDbContext db, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(db);
        await db.PushTokens.Where(t => t.DeviceId == message.DeviceId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        // Remembered, so the device can't register a token again with a still-valid access token.
        if (!await db.RevokedDevices.AnyAsync(d => d.DeviceId == message.DeviceId, ct).ConfigureAwait(false))
            db.RevokedDevices.Add(new RevokedDeviceRow { DeviceId = message.DeviceId, UserId = message.UserId });
    }
}

public sealed record PurgeUserNotifications(Guid UserId, DateTimeOffset ExecuteAfter);

/// <summary>Notification's part of the account-deletion saga.</summary>
public static class AccountDeletionHandler
{
    public const string ServiceName = "notification";

    public static async Task Handle(AccountDeletionRequestedV1 message, IMessageContext bus, IClock clock)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(bus);
        ArgumentNullException.ThrowIfNull(clock);
        var purge = new PurgeUserNotifications(message.UserId, message.ExecuteAfter);
        if (message.ExecuteAfter <= clock.UtcNow) await bus.PublishAsync(purge).ConfigureAwait(false);
        else await bus.ScheduleAsync(purge, message.ExecuteAfter).ConfigureAwait(false);
    }

    public static async Task<OutgoingMessages> Handle(
        PurgeUserNotifications command, NotificationDbContext db, DeletionCancellations cancellations, IClock clock, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(cancellations);
        ArgumentNullException.ThrowIfNull(clock);
        if (await cancellations.IsCancelledAsync(command.UserId, command.ExecuteAfter, ct).ConfigureAwait(false)) return [];
        await db.PushTokens.Where(t => t.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        await db.RevokedDevices.Where(d => d.UserId == command.UserId).ExecuteDeleteAsync(ct).ConfigureAwait(false);
        return [new UserDataPurgedV1(command.UserId, ServiceName, clock.UtcNow)];
    }
}
