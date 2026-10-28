using Khazana.Identity.Application.Persistence;
using Khazana.Identity.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Khazana.Identity.Application;

/// <summary>What the app receives after signing in or refreshing.</summary>
public sealed record TokenPair(string AccessToken, int ExpiresIn, string RefreshToken, Guid UserId, Guid DeviceId);

/// <summary>OAuth-style error codes (RFC 6749 §5.2), all a client is told.</summary>
public enum AuthError
{
    InvalidRequest,
    InvalidGrant,
    UnsupportedProvider,
    AccountDeletionPending,

    /// <summary>The cooling-off is over: the deletion can't be undone any more.</summary>
    DeletionTooLate,

    /// <summary>The session behind this token was logged out or revoked.</summary>
    SessionRevoked,

    /// <summary>A sensitive action needs a sign-in from the last few minutes.</summary>
    ReauthenticationRequired,

    /// <summary>Not a mobile number we can text.</summary>
    InvalidPhone,

    /// <summary>Too many texts or tries; see <see cref="AuthFailedException.RetryAfterSeconds"/>.</summary>
    TooManyRequests,

    /// <summary>The SMS provider could not take the message right now.</summary>
    TemporarilyUnavailable,
}

/// <summary>A refused sign-in or refresh. <see cref="Exception.Message"/> is for logs only.</summary>
public sealed class AuthFailedException : Exception
{
    public AuthFailedException(AuthError error, string logMessage) : base(logMessage) => Error = error;
    public AuthFailedException() : this(AuthError.InvalidRequest, "Refused.") { }
    public AuthFailedException(string message) : this(AuthError.InvalidRequest, message) { }
    public AuthFailedException(string message, Exception inner) : base(message, inner) => Error = AuthError.InvalidRequest;

    public AuthFailedException(AuthError error, string logMessage, int retryAfterSeconds) : this(error, logMessage) =>
        RetryAfterSeconds = retryAfterSeconds;

    public AuthError Error { get; }

    /// <summary>For <see cref="AuthError.TooManyRequests"/>: when asking again can work.</summary>
    public int? RetryAfterSeconds { get; }
}

/// <summary>
/// Sessions: sign in, rotate, log out, ask for deletion, restore. Each sign-in
/// is one device session: a <see cref="SessionRow"/> plus a family of refresh
/// tokens bound to one device key.
/// </summary>
/// <remarks>
/// Concurrency rules, each one closing a race found in review:
/// <list type="bullet">
/// <item>A refresh locks its session row; a logout updates it. So a logout
/// waits for an in-flight refresh and then revokes the token it just made,
/// instead of missing it.</item>
/// <item>Sign-in, deletion and restore lock the user row, so a sign-in can't
/// slip in while a deletion is being requested.</item>
/// <item>First sign-ins for one external account take an advisory lock on the
/// account, so two at once create one user, not a unique-key 500.</item>
/// </list>
/// The outbox flush commits the transaction it finds, so every write and every
/// event of an operation lands together.
/// </remarks>
public sealed class SessionService(
    IDbContextOutbox<IdentityDbContext> outbox,
    IFieldProtector protector,
    TokenIssuer issuer,
    IClock clock)
{
    private IdentityDbContext Db => outbox.DbContext;

    private const string SubjectPurpose = "identity.subject";
    private const string EmailPurpose = "identity.email";
    private const string NamePurpose = "identity.display-name";

    /// <summary>How recent a sign-in must be for actions that add a way into the account.</summary>
    public static readonly TimeSpan FreshSignIn = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Signs in with a verified Google, Apple or dev identity, creating the user
    /// the first time. Publishes <see cref="UserRegisteredV1"/> (first time) and
    /// <see cref="UserSignedInV1"/> in the same transaction as the rows.
    /// </summary>
    public async Task<TokenPair> SignInExternalAsync(ExternalIdentity identity, string jkt, string platform, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(identity);
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var (user, registered) = await FindOrCreateUserAsync(identity, ct).ConfigureAwait(false);
        var pair = await StartSessionAsync(user, registered, jkt, platform, ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return pair;
    }

    /// <summary>Signs in a user whose passkey assertion was just verified.</summary>
    public async Task<TokenPair> SignInPasskeyAsync(Guid userId, string jkt, string platform, CancellationToken ct)
    {
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var user = await LockUserAsync(userId, ct).ConfigureAwait(false);
        var pair = await StartSessionAsync(user, registered: false, jkt, platform, ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return pair;
    }

    /// <summary>
    /// Creates an account from a passkey alone: the user, the passkey and the
    /// first session land in one transaction, with <see cref="UserRegisteredV1"/>
    /// and <see cref="UserSignedInV1"/>. The user id was reserved by the
    /// single-use sign-up challenge, so a second attempt can't reuse it, and the
    /// unique credential id stops one authenticator from making two accounts.
    /// </summary>
    public async Task<TokenPair> SignUpWithPasskeyAsync(NewPasskey passkey, string jkt, string platform, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(passkey);
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var now = clock.UtcNow;
        var user = new UserRow { Id = passkey.UserId, Status = AccountStatus.Active, CreatedAt = now, UpdatedAt = now };
        Db.Users.Add(user);
        Db.Passkeys.Add(new PasskeyRow
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            CredentialId = passkey.CredentialId,
            PublicKey = passkey.PublicKey,
            SignCount = passkey.SignCount,
            AaGuid = passkey.AaGuid,
            CreatedAt = now,
        });
        TokenPair pair;
        try
        {
            pair = await StartSessionAsync(user, registered: true, jkt, platform, ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            throw new AuthFailedException(AuthError.InvalidGrant, "Passkey or user already registered.");
        }
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return pair;
    }

    /// <summary>
    /// Undoes a deletion request during the cooling-off, for a user who proved
    /// who they are again (Google, Apple or passkey), and signs them in.
    /// Publishes <see cref="AccountDeletionCancelledV1"/> so every service drops
    /// its scheduled purge. A user with no deletion pending is simply signed in.
    /// </summary>
    public async Task<TokenPair> RestoreExternalAsync(ExternalIdentity identity, string jkt, string platform, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(identity);
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var link = await FindLinkAsync(identity, ct).ConfigureAwait(false)
            ?? throw new AuthFailedException(AuthError.InvalidGrant, "No account for this identity.");
        var pair = await RestoreAsync(await LockUserAsync(link.UserId, ct).ConfigureAwait(false), jkt, platform, ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return pair;
    }

    public async Task<TokenPair> RestorePasskeyAsync(Guid userId, string jkt, string platform, CancellationToken ct)
    {
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var pair = await RestoreAsync(await LockUserAsync(userId, ct).ConfigureAwait(false), jkt, platform, ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return pair;
    }

    private async Task<TokenPair> RestoreAsync(UserRow user, string jkt, string platform, CancellationToken ct)
    {
        if (user.Status == AccountStatus.DeletionRequested)
        {
            var executeAfter = user.DeleteRequestedAt!.Value + AccountDeletion.CoolingOff;
            if (clock.UtcNow >= executeAfter)
                throw new AuthFailedException(AuthError.DeletionTooLate, $"User {user.Id}: cooling-off over.");
            user.Status = AccountStatus.Active;
            user.DeleteRequestedAt = null;
            user.UpdatedAt = clock.UtcNow;
            // The saga forgets the request; a stray confirmation later finds nothing to count.
            await Db.DeletionConfirmations.Where(c => c.UserId == user.Id).ExecuteDeleteAsync(ct).ConfigureAwait(false);
            await Db.DeletionRequests.Where(r => r.UserId == user.Id).ExecuteDeleteAsync(ct).ConfigureAwait(false);
            await outbox.PublishAsync(new AccountDeletionCancelledV1(user.Id, executeAfter)).ConfigureAwait(false);
        }
        return await StartSessionAsync(user, registered: false, jkt, platform, ct).ConfigureAwait(false);
    }

    private async Task<(UserRow User, bool Registered)> FindOrCreateUserAsync(ExternalIdentity identity, CancellationToken ct)
    {
        var subjectHash = SubjectHash(identity);
        // One first sign-in per external account at a time, so two can't both create the user.
        await Db.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({Convert.ToHexString(subjectHash)}, 0))", ct).ConfigureAwait(false);

        var link = await FindLinkAsync(identity, ct).ConfigureAwait(false);
        if (link is not null) return (await LockUserAsync(link.UserId, ct).ConfigureAwait(false), false);

        var now = clock.UtcNow;
        var user = new UserRow
        {
            Id = Guid.CreateVersion7(),
            Status = AccountStatus.Active,
            EmailEnc = identity.Email is null ? null : protector.Encrypt(identity.Email, EmailPurpose),
            EmailHash = identity.Email is null ? null : protector.Hash(identity.Email.Trim().ToUpperInvariant(), EmailPurpose),
            DisplayNameEnc = identity.DisplayName is null ? null : protector.Encrypt(identity.DisplayName, NamePurpose),
            CreatedAt = now,
            UpdatedAt = now,
        };
        Db.Users.Add(user);
        Db.ExternalLogins.Add(new ExternalLoginRow
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            Provider = identity.Provider,
            SubjectHash = subjectHash,
            CreatedAt = now,
        });
        return (user, true);
    }

    private Task<ExternalLoginRow?> FindLinkAsync(ExternalIdentity identity, CancellationToken ct)
    {
        var subjectHash = SubjectHash(identity);
        return Db.ExternalLogins.FirstOrDefaultAsync(x => x.Provider == identity.Provider && x.SubjectHash == subjectHash, ct);
    }

    private byte[] SubjectHash(ExternalIdentity identity) =>
        protector.Hash($"{identity.Provider}:{identity.Subject}", SubjectPurpose);

    private async Task<TokenPair> StartSessionAsync(UserRow user, bool registered, string jkt, string platform, CancellationToken ct)
    {
        if (user.Status == AccountStatus.DeletionRequested)
            throw new AuthFailedException(AuthError.AccountDeletionPending, $"User {user.Id} has a deletion pending.");

        var now = clock.UtcNow;
        var deviceId = Guid.CreateVersion7();
        var familyId = Guid.CreateVersion7();
        var (raw, hash) = TokenIssuer.NewRefreshToken();
        Db.Sessions.Add(new SessionRow { FamilyId = familyId, UserId = user.Id, DeviceId = deviceId, CreatedAt = now });
        Db.RefreshTokens.Add(new RefreshTokenRow
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            DeviceId = deviceId,
            FamilyId = familyId,
            TokenHash = hash,
            Jkt = jkt,
            Platform = platform,
            ExpiresAt = now + RefreshTokenRules.Lifetime,
            CreatedAt = now,
        });

        if (registered) await outbox.PublishAsync(new UserRegisteredV1(user.Id, deviceId, platform, now)).ConfigureAwait(false);
        await outbox.PublishAsync(new UserSignedInV1(user.Id, deviceId, platform, now)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);

        var access = issuer.IssueAccess(user.Id, deviceId, jkt);
        return new TokenPair(access.Token, access.ExpiresInSeconds, raw, user.Id, deviceId);
    }

    /// <summary>
    /// Rotates a refresh token. The token must be unused, unexpired, unrevoked,
    /// in a live session, and presented with the device key it was issued to. A
    /// used or foreign token ends the whole session (see <see cref="RefreshVerdict.Reused"/>).
    /// </summary>
    public async Task<TokenPair> RefreshAsync(string rawRefreshToken, string jkt, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawRefreshToken) || rawRefreshToken.Length > 128)
            throw new AuthFailedException(AuthError.InvalidRequest, "Malformed refresh token.");

        var hash = TokenIssuer.HashRefreshToken(rawRefreshToken);
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var found = await Db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(x => x.TokenHash == hash, ct).ConfigureAwait(false)
            ?? throw new AuthFailedException(AuthError.InvalidGrant, "Unknown refresh token.");

        // Hold the session for the rest of this rotation; a concurrent logout waits.
        var session = (await Db.Sessions.FromSql($"SELECT * FROM identity.sessions WHERE family_id = {found.FamilyId} FOR UPDATE")
            .ToListAsync(ct).ConfigureAwait(false)).SingleOrDefault();
        if (session is null || session.RevokedAt is not null)
            throw new AuthFailedException(AuthError.InvalidGrant, $"Session {found.FamilyId} revoked.");

        // Re-read under the lock: whatever committed while we waited counts.
        var token = await Db.RefreshTokens.AsNoTracking().SingleAsync(x => x.Id == found.Id, ct).ConfigureAwait(false);
        var now = clock.UtcNow;
        var verdict = RefreshTokenRules.Evaluate(token.ExpiresAt, token.UsedAt, token.RevokedAt, token.Jkt, jkt, now);
        if (RefreshTokenRules.RevokesSession(verdict))
        {
            await EndSessionsAsync(token.UserId, session.DeviceId, everywhere: false, ct).ConfigureAwait(false);
            await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
            await CommitIfOpenAsync(ct).ConfigureAwait(false);
            throw new AuthFailedException(AuthError.InvalidGrant, $"Refresh token {verdict}; session {token.FamilyId} revoked.");
        }
        if (verdict != RefreshVerdict.Valid)
            throw new AuthFailedException(AuthError.InvalidGrant, $"Refresh token {verdict}.");

        var user = await Db.Users.AsNoTracking().SingleAsync(x => x.Id == token.UserId, ct).ConfigureAwait(false);
        if (user.Status != AccountStatus.Active)
            throw new AuthFailedException(AuthError.AccountDeletionPending, $"User {user.Id} has a deletion pending.");

        // Claim the token atomically: of two requests racing with the same
        // token, exactly one updates the row. The loser is a reuse.
        var claimed = await Db.RefreshTokens
            .Where(x => x.Id == token.Id && x.UsedAt == null && x.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct).ConfigureAwait(false);
        if (claimed != 1)
        {
            await EndSessionsAsync(token.UserId, session.DeviceId, everywhere: false, ct).ConfigureAwait(false);
            await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
            await CommitIfOpenAsync(ct).ConfigureAwait(false);
            throw new AuthFailedException(AuthError.InvalidGrant, $"Refresh token raced; session {token.FamilyId} revoked.");
        }

        var (raw, newHash) = TokenIssuer.NewRefreshToken();
        Db.RefreshTokens.Add(new RefreshTokenRow
        {
            Id = Guid.CreateVersion7(),
            UserId = token.UserId,
            DeviceId = token.DeviceId,
            FamilyId = token.FamilyId,
            TokenHash = newHash,
            Jkt = token.Jkt,
            Platform = token.Platform,
            // The session's lifetime slides with use, but each token still lives 30 days at most.
            ExpiresAt = now + RefreshTokenRules.Lifetime,
            CreatedAt = now,
        });
        await Db.SaveChangesAsync(ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);

        var access = issuer.IssueAccess(token.UserId, token.DeviceId, token.Jkt);
        return new TokenPair(access.Token, access.ExpiresInSeconds, raw, token.UserId, token.DeviceId);
    }

    /// <summary>
    /// Ends this device's session, or every session the user has, and tells
    /// Devices & Keys (<see cref="SessionEndedV1"/>). Waits for any refresh in
    /// flight, so the token that refresh issues is revoked too.
    /// </summary>
    public async Task<int> LogoutAsync(Guid userId, Guid deviceId, bool everywhere, CancellationToken ct)
    {
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var ended = await EndSessionsAsync(userId, deviceId, everywhere, ct).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return ended;
    }

    /// <summary>
    /// For sensitive endpoints: the token's session must still be live, the
    /// account active, and (when <paramref name="maxAge"/> is given) the sign-in recent.
    /// An access token outlives a logout by up to 15 minutes; this closes that gap.
    /// </summary>
    public async Task RequireLiveSessionAsync(Guid userId, Guid deviceId, TimeSpan? maxAge, CancellationToken ct)
    {
        var session = await Db.Sessions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == userId && x.DeviceId == deviceId && x.RevokedAt == null, ct).ConfigureAwait(false);
        var user = await Db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, ct).ConfigureAwait(false);
        if (session is null || user is null || user.Status != AccountStatus.Active)
            throw new AuthFailedException(AuthError.SessionRevoked, $"Session for device {deviceId} is not live.");
        if (maxAge is { } age && clock.UtcNow - session.CreatedAt > age)
            throw new AuthFailedException(AuthError.ReauthenticationRequired, $"Session for device {deviceId} is older than {age}.");
    }

    /// <summary>
    /// Starts account deletion: no new sessions, every session revoked, and
    /// <see cref="AccountDeletionRequestedV1"/> tells every service to delete
    /// after the cooling-off. Asking twice, even at the same moment, changes nothing.
    /// </summary>
    public async Task<DateTimeOffset> RequestDeletionAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var user = await LockUserAsync(userId, ct).ConfigureAwait(false);
        if (user.Status == AccountStatus.DeletionRequested)
            return user.DeleteRequestedAt!.Value + AccountDeletion.CoolingOff;

        var now = clock.UtcNow;
        user.Status = AccountStatus.DeletionRequested;
        user.DeleteRequestedAt = now;
        user.UpdatedAt = now;
        var executeAfter = now + AccountDeletion.CoolingOff;

        await RevokeSessionRowsAsync(userId, null, now, ct).ConfigureAwait(false);
        Db.DeletionRequests.Add(new DeletionRequestRow { UserId = userId, RequestedAt = now, ExecuteAfter = executeAfter });
        await outbox.PublishAsync(new AccountDeletionRequestedV1(userId, executeAfter)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        await CommitIfOpenAsync(ct).ConfigureAwait(false);
        return executeAfter;
    }

    /// <summary>Revokes sessions and their tokens, and queues a <see cref="SessionEndedV1"/> per device.</summary>
    private async Task<int> EndSessionsAsync(Guid userId, Guid deviceId, bool everywhere, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var devices = await RevokeSessionRowsAsync(userId, everywhere ? null : deviceId, now, ct).ConfigureAwait(false);
        foreach (var device in devices) await outbox.PublishAsync(new SessionEndedV1(userId, device, now)).ConfigureAwait(false);
        return devices.Count;
    }

    /// <summary>
    /// Session rows first (this waits for a refresh holding one), then every
    /// unrevoked token of the user or device, read fresh after the wait.
    /// </summary>
    private async Task<List<Guid>> RevokeSessionRowsAsync(Guid userId, Guid? deviceId, DateTimeOffset now, CancellationToken ct)
    {
        var devices = deviceId is { } d
            ? await Db.Database.SqlQuery<Guid>($"""
                UPDATE identity.sessions SET revoked_at = {now}
                WHERE user_id = {userId} AND device_id = {d} AND revoked_at IS NULL
                RETURNING device_id AS "Value"
                """).ToListAsync(ct).ConfigureAwait(false)
            : await Db.Database.SqlQuery<Guid>($"""
                UPDATE identity.sessions SET revoked_at = {now}
                WHERE user_id = {userId} AND revoked_at IS NULL
                RETURNING device_id AS "Value"
                """).ToListAsync(ct).ConfigureAwait(false);

        var tokens = Db.RefreshTokens.Where(x => x.UserId == userId && x.RevokedAt == null);
        if (deviceId is { } only) tokens = tokens.Where(x => x.DeviceId == only);
        await tokens.ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct).ConfigureAwait(false);
        return devices;
    }

    private async Task<UserRow> LockUserAsync(Guid userId, CancellationToken ct) =>
        (await Db.Users.FromSql($"SELECT * FROM identity.users WHERE id = {userId} FOR UPDATE")
            .ToListAsync(ct).ConfigureAwait(false)).SingleOrDefault()
        ?? throw new AuthFailedException(AuthError.InvalidGrant, $"No user {userId}.");

    /// <summary>The outbox flush commits the open transaction; commit here only if it didn't.</summary>
    private async Task CommitIfOpenAsync(CancellationToken ct)
    {
        if (Db.Database.CurrentTransaction is { } open) await open.CommitAsync(ct).ConfigureAwait(false);
    }
}
