using System.Security.Cryptography;
using Khazana.Devices.Application.Persistence;
using Khazana.Devices.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Khazana.Devices.Application;

/// <summary>Who is calling: from a verified, DPoP-bound access token.</summary>
public sealed record Caller(Guid UserId, Guid DeviceId, string Jkt);

public enum DevicesError
{
    BadRequest,
    Forbidden,
    NotFound,
    Conflict,
    /// <summary>Needs a passkey check made in the last two minutes (a step-up token).</summary>
    StepUpRequired,
}

/// <summary>A refused request. The message is for logs; clients see only the error code.</summary>
public sealed class DevicesException : Exception
{
    public DevicesException(DevicesError error, string logMessage) : base(logMessage) => Error = error;
    public DevicesException() : this(DevicesError.BadRequest, "Refused.") { }
    public DevicesException(string message) : this(DevicesError.BadRequest, message) { }
    public DevicesException(string message, Exception inner) : base(message, inner) => Error = DevicesError.BadRequest;

    public DevicesError Error { get; }
}

public sealed record Envelope(byte[] WrappedDek, string Alg, int KeyVersion);

public sealed record DeviceView(Guid Id, string Name, string Platform, string? AppVersion,
    DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt, bool Current);

/// <param name="HasKey">This device holds the data key (has an envelope).</param>
/// <param name="AccountHasKeys">The account has a data key at all; false means bootstrap.</param>
public sealed record DeviceStatus(Guid DeviceId, bool HasKey, bool AccountHasKeys, int? KeyVersion);

public sealed record PairingStart(Guid PairingId, string Code, DateTimeOffset ExpiresAt);

public sealed record PairingTarget(Guid NewDeviceId, string Name, string Platform, byte[] PublicKey);

/// <summary>
/// Devices, their key envelopes, and QR pairing (design doc §6, §8.1).
/// The server relays and stores ciphertext; it can't decrypt anything.
/// </summary>
public sealed class DeviceKeyService(IDbContextOutbox<DevicesDbContext> outbox, IClock clock)
{
    private DevicesDbContext Db => outbox.DbContext;

    // --- devices ----------------------------------------------------------------

    /// <summary>
    /// Registers the calling device's X25519 public key. Idempotent for the same
    /// key; a different key for the same device is refused, because its
    /// envelope is wrapped to the first one.
    /// </summary>
    public async Task<DeviceStatus> RegisterAsync(
        Caller caller, string? name, string platform, string? appVersion, byte[] publicKey, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        if (!DeviceRules.Platforms.Contains(platform)) throw new DevicesException(DevicesError.BadRequest, "Unknown platform.");
        if (!KeyRules.IsValidPublicKey(publicKey)) throw new DevicesException(DevicesError.BadRequest, "Public key must be 32 bytes.");
        if (appVersion is { Length: > DeviceRules.MaxAppVersionLength }) throw new DevicesException(DevicesError.BadRequest, "App version too long.");

        var now = clock.UtcNow;
        var device = await Db.Devices.FirstOrDefaultAsync(d => d.Id == caller.DeviceId, ct).ConfigureAwait(false);
        if (device is null)
        {
            device = new DeviceRow
            {
                Id = caller.DeviceId,
                UserId = caller.UserId,
                Name = DeviceRules.CleanName(name),
                Platform = platform,
                AppVersion = appVersion,
                PublicKey = publicKey,
                DpopJkt = caller.Jkt,
                CreatedAt = now,
                LastSeenAt = now,
            };
            Db.Devices.Add(device);
            await outbox.PublishAsync(new DeviceAddedV1(caller.UserId, caller.DeviceId, platform, now)).ConfigureAwait(false);
        }
        else
        {
            if (device.UserId != caller.UserId || device.RevokedAt is not null)
                throw new DevicesException(DevicesError.Forbidden, $"Device {device.Id} is revoked or not the caller's.");
            if (!CryptographicOperations.FixedTimeEquals(device.PublicKey, publicKey))
                throw new DevicesException(DevicesError.Conflict, $"Device {device.Id} tried to change its public key.");
            device.Name = DeviceRules.CleanName(name);
            device.AppVersion = appVersion;
            device.LastSeenAt = now;
        }
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two first registrations at once: the primary key let the other one win.
            throw new DevicesException(DevicesError.Conflict, $"Device {caller.DeviceId} registered concurrently; retry.");
        }
        return await StatusAsync(caller, ct).ConfigureAwait(false);
    }

    public async Task<DeviceStatus> StatusAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        var version = await CurrentKeyVersionAsync(caller.UserId, ct).ConfigureAwait(false);
        var hasKey = version is not null && await Db.KeyEnvelopes.AnyAsync(
            e => e.UserId == caller.UserId && e.DeviceId == caller.DeviceId && e.KeyVersion == version, ct).ConfigureAwait(false);
        return new DeviceStatus(caller.DeviceId, hasKey, version is not null, version);
    }

    public async Task<IReadOnlyList<DeviceView>> ListAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        var rows = await Db.Devices.AsNoTracking()
            .Where(d => d.UserId == caller.UserId && d.RevokedAt == null)
            .OrderBy(d => d.CreatedAt).ToListAsync(ct).ConfigureAwait(false);
        return [.. rows.Select(d => new DeviceView(d.Id, d.Name, d.Platform, d.AppVersion, d.CreatedAt, d.LastSeenAt, d.Id == caller.DeviceId))];
    }

    /// <summary>Renames one of the caller's devices (any of their signed-in devices may).</summary>
    public async Task RenameAsync(Caller caller, Guid deviceId, string? name, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        if (string.IsNullOrWhiteSpace(name)) throw new DevicesException(DevicesError.BadRequest, "A device name is required.");
        var device = await Db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId && d.UserId == caller.UserId && d.RevokedAt == null, ct).ConfigureAwait(false)
            ?? throw new DevicesException(DevicesError.NotFound, "No such device for this user.");
        device.Name = DeviceRules.CleanName(name);
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Logs a device out remotely: no more envelope, no more pairing, and
    /// <see cref="DeviceRevokedV1"/> so Identity ends its sessions.
    /// </summary>
    public async Task RevokeAsync(Caller caller, Guid deviceId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        if (!await RevokeDeviceAsync(caller.UserId, deviceId, ct).ConfigureAwait(false))
            throw new DevicesException(DevicesError.NotFound, "No such device for this user.");
    }

    /// <summary>
    /// Revokes a device of a user: envelope gone, pairing ended, <see cref="DeviceRevokedV1"/>
    /// announced. Already revoked: nothing to do. False when the user has no such device.
    /// </summary>
    public async Task<bool> RevokeDeviceAsync(Guid userId, Guid deviceId, CancellationToken ct)
    {
        var device = await Db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId && d.UserId == userId, ct).ConfigureAwait(false);
        if (device is null) return false;
        if (device.RevokedAt is not null) return true;

        var now = clock.UtcNow;
        device.RevokedAt = now;
        Db.KeyEnvelopes.RemoveRange(await Db.KeyEnvelopes.Where(e => e.DeviceId == deviceId).ToListAsync(ct).ConfigureAwait(false));
        foreach (var session in await Db.PairingSessions.Where(p => p.NewDeviceId == deviceId && p.CompletedAt == null).ToListAsync(ct).ConfigureAwait(false))
            session.CompletedAt = now;
        await outbox.PublishAsync(new DeviceRevokedV1(userId, deviceId, now)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        return true;
    }

    /// <summary>
    /// Every request except registration: the device is registered, not
    /// revoked, and the token is bound to the key it registered with.
    /// </summary>
    public async Task RequireActiveAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        var device = await Db.Devices.FirstOrDefaultAsync(d => d.Id == caller.DeviceId, ct).ConfigureAwait(false);
        if (device is null || device.UserId != caller.UserId || device.RevokedAt is not null || device.DpopJkt != caller.Jkt)
            throw new DevicesException(DevicesError.Forbidden, $"Device {caller.DeviceId} is not registered, revoked, or on another key.");
        var now = clock.UtcNow;
        if (now - device.LastSeenAt > DeviceRules.LastSeenResolution)
        {
            device.LastSeenAt = now;
            await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
    }

    // --- key envelopes --------------------------------------------------------

    /// <summary>
    /// The first device creates the account's data key: one envelope for itself,
    /// one for the recovery phrase, and the key-check hash. Allowed once.
    /// </summary>
    public async Task BootstrapAsync(Caller caller, Envelope device, Envelope recovery, byte[] keyCheck, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(recovery);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        if (device.KeyVersion != 1 || recovery.KeyVersion != 1 ||
            !KeyRules.IsValidEnvelope(device.WrappedDek, device.Alg, device.KeyVersion, recovery: false) ||
            !KeyRules.IsValidEnvelope(recovery.WrappedDek, recovery.Alg, recovery.KeyVersion, recovery: true) ||
            !KeyRules.IsValidKeyCheck(keyCheck))
            throw new DevicesException(DevicesError.BadRequest, "Bootstrap envelopes or key check malformed.");
        if (await CurrentKeyVersionAsync(caller.UserId, ct).ConfigureAwait(false) is not null)
            throw new DevicesException(DevicesError.Conflict, "The account already has a data key.");

        var now = clock.UtcNow;
        Db.KeyChecks.Add(new KeyCheckRow { UserId = caller.UserId, KeyVersion = 1, CheckHash = SHA256.HashData(keyCheck), CreatedAt = now });
        Db.KeyEnvelopes.Add(NewEnvelope(caller.UserId, caller.DeviceId, device, now));
        Db.KeyEnvelopes.Add(NewEnvelope(caller.UserId, null, recovery, now));
        try
        {
            await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two devices bootstrapping at once: the key_checks primary key lets one win.
            throw new DevicesException(DevicesError.Conflict, "The account already has a data key.");
        }
    }

    public async Task<Envelope> GetOwnEnvelopeAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        var row = await Db.KeyEnvelopes.AsNoTracking()
            .Where(e => e.UserId == caller.UserId && e.DeviceId == caller.DeviceId)
            .OrderByDescending(e => e.KeyVersion).FirstOrDefaultAsync(ct).ConfigureAwait(false)
            ?? throw new DevicesException(DevicesError.NotFound, "This device has no envelope yet.");
        return new Envelope(row.WrappedDek, row.Alg, row.KeyVersion);
    }

    /// <summary>
    /// The recovery envelope, for a new device whose user typed the recovery
    /// phrase. Encrypted under a 256-bit phrase stretched with Argon2id, so
    /// handing it out reveals nothing without the phrase.
    /// </summary>
    public async Task<Envelope> GetRecoveryEnvelopeAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        var row = await Db.KeyEnvelopes.AsNoTracking()
            .Where(e => e.UserId == caller.UserId && e.DeviceId == null)
            .OrderByDescending(e => e.KeyVersion).FirstOrDefaultAsync(ct).ConfigureAwait(false)
            ?? throw new DevicesException(DevicesError.NotFound, "The account has no recovery envelope.");
        return new Envelope(row.WrappedDek, row.Alg, row.KeyVersion);
    }

    /// <summary>After recovery: the device proves it holds the data key, then stores its own envelope.</summary>
    public async Task AddOwnEnvelopeAsync(Caller caller, Envelope envelope, byte[] keyCheck, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        ArgumentNullException.ThrowIfNull(envelope);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        if (!KeyRules.IsValidEnvelope(envelope.WrappedDek, envelope.Alg, envelope.KeyVersion, recovery: false))
            throw new DevicesException(DevicesError.BadRequest, "Envelope malformed.");
        await RequireKeyCheckAsync(caller.UserId, envelope.KeyVersion, keyCheck, ct).ConfigureAwait(false);
        if (await Db.KeyEnvelopes.AnyAsync(e => e.DeviceId == caller.DeviceId && e.KeyVersion == envelope.KeyVersion, ct).ConfigureAwait(false))
            throw new DevicesException(DevicesError.Conflict, "This device already has an envelope for that key.");
        Db.KeyEnvelopes.Add(NewEnvelope(caller.UserId, caller.DeviceId, envelope, clock.UtcNow));
        await SaveOrConflictAsync("This device already has an envelope for that key.", ct).ConfigureAwait(false);
    }

    /// <summary>A new recovery phrase. Needs a device that holds the key and proves it.</summary>
    public async Task ReplaceRecoveryAsync(Caller caller, Envelope recovery, byte[] keyCheck, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        ArgumentNullException.ThrowIfNull(recovery);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        if (!KeyRules.IsValidEnvelope(recovery.WrappedDek, recovery.Alg, recovery.KeyVersion, recovery: true))
            throw new DevicesException(DevicesError.BadRequest, "Recovery envelope malformed.");
        await RequireHoldsKeyAsync(caller, recovery.KeyVersion, ct).ConfigureAwait(false);
        await RequireKeyCheckAsync(caller.UserId, recovery.KeyVersion, keyCheck, ct).ConfigureAwait(false);

        var existing = await Db.KeyEnvelopes.FirstOrDefaultAsync(
            e => e.UserId == caller.UserId && e.DeviceId == null && e.KeyVersion == recovery.KeyVersion, ct).ConfigureAwait(false);
        if (existing is not null) Db.KeyEnvelopes.Remove(existing);
        Db.KeyEnvelopes.Add(NewEnvelope(caller.UserId, null, recovery, clock.UtcNow));
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    // --- pairing ----------------------------------------------------------------

    /// <summary>
    /// A new device asks to be paired. Its QR code shows the pairing id, the
    /// code returned here, and a hash of its public key; the code is stored
    /// hashed and lives five minutes.
    /// </summary>
    public async Task<PairingStart> StartPairingAsync(Caller caller, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        var status = await StatusAsync(caller, ct).ConfigureAwait(false);
        if (!status.AccountHasKeys) throw new DevicesException(DevicesError.Conflict, "No data key yet: bootstrap instead.");
        if (status.HasKey) throw new DevicesException(DevicesError.Conflict, "This device already holds the key.");

        var now = clock.UtcNow;
        foreach (var old in await Db.PairingSessions.Where(p => p.NewDeviceId == caller.DeviceId && p.CompletedAt == null).ToListAsync(ct).ConfigureAwait(false))
            old.CompletedAt = now;

        var code = RandomNumberGenerator.GetBytes(PairingRules.CodeBytes);
        var session = new PairingSessionRow
        {
            Id = Guid.CreateVersion7(),
            UserId = caller.UserId,
            NewDeviceId = caller.DeviceId,
            CodeHash = SHA256.HashData(code),
            ExpiresAt = now + PairingRules.Lifetime,
        };
        Db.PairingSessions.Add(session);
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        return new PairingStart(session.Id, Base64Url(code), session.ExpiresAt);
    }

    /// <summary>
    /// What the existing device needs to wrap the key: the new device's public
    /// key. The app compares its hash with the one in the QR before wrapping,
    /// so a server that substituted its own key would be caught.
    /// </summary>
    public async Task<PairingTarget> GetPairingAsync(Caller caller, Guid pairingId, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        var session = await OpenSessionAsync(caller.UserId, pairingId, ct).ConfigureAwait(false);
        var target = await Db.Devices.AsNoTracking().SingleAsync(d => d.Id == session.NewDeviceId, ct).ConfigureAwait(false);
        return new PairingTarget(target.Id, target.Name, target.Platform, target.PublicKey);
    }

    /// <summary>
    /// The existing device approves: it presents the code it scanned (proof it
    /// saw the new device's screen) and the key wrapped to the new device.
    /// </summary>
    public async Task ApprovePairingAsync(Caller caller, Guid pairingId, string code, Envelope envelope, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        ArgumentNullException.ThrowIfNull(envelope);
        await RequireActiveAsync(caller, ct).ConfigureAwait(false);
        if (!KeyRules.IsValidEnvelope(envelope.WrappedDek, envelope.Alg, envelope.KeyVersion, recovery: false))
            throw new DevicesException(DevicesError.BadRequest, "Envelope malformed.");
        await RequireHoldsKeyAsync(caller, envelope.KeyVersion, ct).ConfigureAwait(false);

        var session = await OpenSessionAsync(caller.UserId, pairingId, ct).ConfigureAwait(false);
        var presented = FromBase64Url(code);
        if (presented is null || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(presented), session.CodeHash))
            throw new DevicesException(DevicesError.Forbidden, "Pairing code does not match.");

        var target = await Db.Devices.SingleAsync(d => d.Id == session.NewDeviceId, ct).ConfigureAwait(false);
        if (target.RevokedAt is not null) throw new DevicesException(DevicesError.Conflict, "The new device was revoked.");

        // Claim the session and store the envelope in one transaction: a code
        // approves exactly once, and never without leaving the envelope behind.
        var now = clock.UtcNow;
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var claimed = await Db.PairingSessions
            .Where(p => p.Id == pairingId && p.CompletedAt == null && p.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.CompletedAt, now), ct).ConfigureAwait(false);
        if (claimed != 1) throw new DevicesException(DevicesError.NotFound, "Pairing session already used or expired.");

        Db.KeyEnvelopes.Add(NewEnvelope(caller.UserId, target.Id, envelope, now));
        await SaveOrConflictAsync("The new device already holds that key.", ct).ConfigureAwait(false);
        await tx.CommitAsync(ct).ConfigureAwait(false);
    }

    // --- helpers ------------------------------------------------------------------

    /// <summary>A unique-key race (two requests doing the same thing at once) is a 409, not a 500.</summary>
    private async Task SaveOrConflictAsync(string conflictMessage, CancellationToken ct)
    {
        try
        {
            await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            throw new DevicesException(DevicesError.Conflict, conflictMessage);
        }
    }

    private async Task<PairingSessionRow> OpenSessionAsync(Guid userId, Guid pairingId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        return await Db.PairingSessions.AsNoTracking().FirstOrDefaultAsync(
                p => p.Id == pairingId && p.UserId == userId && p.CompletedAt == null && p.ExpiresAt > now, ct).ConfigureAwait(false)
            ?? throw new DevicesException(DevicesError.NotFound, "No open pairing session.");
    }

    private Task<int?> CurrentKeyVersionAsync(Guid userId, CancellationToken ct) =>
        Db.KeyChecks.Where(k => k.UserId == userId).MaxAsync(k => (int?)k.KeyVersion, ct);

    private async Task RequireHoldsKeyAsync(Caller caller, int keyVersion, CancellationToken ct)
    {
        if (!await Db.KeyEnvelopes.AnyAsync(e => e.UserId == caller.UserId && e.DeviceId == caller.DeviceId && e.KeyVersion == keyVersion, ct).ConfigureAwait(false))
            throw new DevicesException(DevicesError.Forbidden, "Only a device holding the key can do this.");
    }

    private async Task RequireKeyCheckAsync(Guid userId, int keyVersion, byte[] keyCheck, CancellationToken ct)
    {
        var stored = await Db.KeyChecks.AsNoTracking()
            .FirstOrDefaultAsync(k => k.UserId == userId && k.KeyVersion == keyVersion, ct).ConfigureAwait(false);
        if (stored is null || !KeyRules.IsValidKeyCheck(keyCheck) ||
            !CryptographicOperations.FixedTimeEquals(SHA256.HashData(keyCheck), stored.CheckHash))
            throw new DevicesException(DevicesError.Forbidden, "Key check failed.");
    }

    private static KeyEnvelopeRow NewEnvelope(Guid userId, Guid? deviceId, Envelope e, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(),
        UserId = userId,
        DeviceId = deviceId,
        WrappedDek = e.WrappedDek,
        Alg = e.Alg,
        KeyVersion = e.KeyVersion,
        CreatedAt = now,
    };

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[]? FromBase64Url(string? s)
    {
        if (string.IsNullOrEmpty(s) || s.Length > 64) return null;
        var b64 = s.Replace('-', '+').Replace('_', '/');
        b64 = b64.PadRight(b64.Length + ((4 - (b64.Length % 4)) % 4), '=');
        try
        {
            return Convert.FromBase64String(b64);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
