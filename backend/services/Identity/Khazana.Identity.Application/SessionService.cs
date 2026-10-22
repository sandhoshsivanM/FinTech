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
}

/// <summary>A refused sign-in or refresh. <see cref="Exception.Message"/> is for logs only.</summary>
public sealed class AuthFailedException : Exception
{
    public AuthFailedException(AuthError error, string logMessage) : base(logMessage) => Error = error;
    public AuthFailedException() : this(AuthError.InvalidRequest, "Refused.") { }
    public AuthFailedException(string message) : this(AuthError.InvalidRequest, message) { }
    public AuthFailedException(string message, Exception inner) : base(message, inner) => Error = AuthError.InvalidRequest;

    public AuthError Error { get; }
}

/// <summary>
/// Sessions: sign in, rotate, log out, ask for deletion. Each sign-in is one
/// device session (a token family bound to one device key).
/// </summary>
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

    /// <summary>
    /// Signs in with a verified Google, Apple or dev identity, creating the user
    /// the first time. Publishes <see cref="UserRegisteredV1"/> (first time) and
    /// <see cref="UserSignedInV1"/> in the same transaction as the rows.
    /// </summary>
    public async Task<TokenPair> SignInExternalAsync(ExternalIdentity identity, string jkt, string platform, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(identity);
        var subjectHash = protector.Hash($"{identity.Provider}:{identity.Subject}", SubjectPurpose);
        var link = await Db.ExternalLogins
            .FirstOrDefaultAsync(x => x.Provider == identity.Provider && x.SubjectHash == subjectHash, ct)
            .ConfigureAwait(false);

        var now = clock.UtcNow;
        UserRow user;
        var registered = false;
        if (link is null)
        {
            user = new UserRow
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
            registered = true;
        }
        else
        {
            user = await Db.Users.SingleAsync(x => x.Id == link.UserId, ct).ConfigureAwait(false);
        }

        return await StartSessionAsync(user, registered, jkt, platform, ct).ConfigureAwait(false);
    }

    /// <summary>Signs in a user whose passkey assertion was just verified.</summary>
    public async Task<TokenPair> SignInPasskeyAsync(Guid userId, string jkt, string platform, CancellationToken ct)
    {
        var user = await Db.Users.SingleAsync(x => x.Id == userId, ct).ConfigureAwait(false);
        return await StartSessionAsync(user, registered: false, jkt, platform, ct).ConfigureAwait(false);
    }

    private async Task<TokenPair> StartSessionAsync(UserRow user, bool registered, string jkt, string platform, CancellationToken ct)
    {
        if (user.Status == AccountStatus.DeletionRequested)
            throw new AuthFailedException(AuthError.AccountDeletionPending, $"User {user.Id} has a deletion pending.");

        var now = clock.UtcNow;
        var deviceId = Guid.CreateVersion7();
        var (raw, hash) = TokenIssuer.NewRefreshToken();
        Db.RefreshTokens.Add(new RefreshTokenRow
        {
            Id = Guid.CreateVersion7(),
            UserId = user.Id,
            DeviceId = deviceId,
            FamilyId = Guid.CreateVersion7(),
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
    /// Rotates a refresh token. The token must be unused, unexpired, unrevoked
    /// and presented with the device key it was issued to. A used or foreign
    /// token revokes the whole session (see <see cref="RefreshVerdict.Reused"/>).
    /// </summary>
    public async Task<TokenPair> RefreshAsync(string rawRefreshToken, string jkt, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawRefreshToken) || rawRefreshToken.Length > 128)
            throw new AuthFailedException(AuthError.InvalidRequest, "Malformed refresh token.");

        var hash = TokenIssuer.HashRefreshToken(rawRefreshToken);
        var now = clock.UtcNow;

        await using var tx = await Db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        var token = await Db.RefreshTokens.AsNoTracking().FirstOrDefaultAsync(x => x.TokenHash == hash, ct).ConfigureAwait(false)
            ?? throw new AuthFailedException(AuthError.InvalidGrant, "Unknown refresh token.");

        var verdict = RefreshTokenRules.Evaluate(token.ExpiresAt, token.UsedAt, token.RevokedAt, token.Jkt, jkt, now);
        if (RefreshTokenRules.RevokesSession(verdict))
        {
            await RevokeFamilyAsync(token.FamilyId, now, ct).ConfigureAwait(false);
            await tx.CommitAsync(ct).ConfigureAwait(false);
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
            await RevokeFamilyAsync(token.FamilyId, now, ct).ConfigureAwait(false);
            await tx.CommitAsync(ct).ConfigureAwait(false);
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
        await tx.CommitAsync(ct).ConfigureAwait(false);

        var access = issuer.IssueAccess(token.UserId, token.DeviceId, token.Jkt);
        return new TokenPair(access.Token, access.ExpiresInSeconds, raw, token.UserId, token.DeviceId);
    }

    /// <summary>Ends this device's session, or every session the user has.</summary>
    public async Task<int> LogoutAsync(Guid userId, Guid deviceId, bool everywhere, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var tokens = Db.RefreshTokens.Where(x => x.UserId == userId && x.RevokedAt == null);
        if (!everywhere) tokens = tokens.Where(x => x.DeviceId == deviceId);
        return await tokens.ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Starts account deletion: no new sessions, every session revoked, and
    /// <see cref="AccountDeletionRequestedV1"/> tells every service to delete
    /// after the cooling-off. Asking twice changes nothing.
    /// </summary>
    public async Task<DateTimeOffset> RequestDeletionAsync(Guid userId, CancellationToken ct)
    {
        var user = await Db.Users.SingleAsync(x => x.Id == userId, ct).ConfigureAwait(false);
        if (user.Status == AccountStatus.DeletionRequested)
            return user.DeleteRequestedAt!.Value + AccountDeletion.CoolingOff;

        var now = clock.UtcNow;
        user.Status = AccountStatus.DeletionRequested;
        user.DeleteRequestedAt = now;
        user.UpdatedAt = now;
        var executeAfter = now + AccountDeletion.CoolingOff;

        foreach (var token in await Db.RefreshTokens
                     .Where(x => x.UserId == userId && x.RevokedAt == null).ToListAsync(ct).ConfigureAwait(false))
        {
            token.RevokedAt = now;
        }

        Db.DeletionRequests.Add(new DeletionRequestRow { UserId = userId, RequestedAt = now, ExecuteAfter = executeAfter });
        await outbox.PublishAsync(new AccountDeletionRequestedV1(userId, executeAfter)).ConfigureAwait(false);
        await outbox.SaveChangesAndFlushMessagesAsync(ct).ConfigureAwait(false);
        return executeAfter;
    }

    private Task<int> RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken ct) =>
        Db.RefreshTokens.Where(x => x.FamilyId == familyId && x.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
}
