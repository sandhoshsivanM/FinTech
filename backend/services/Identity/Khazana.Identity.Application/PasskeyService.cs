using Fido2NetLib;
using Fido2NetLib.Objects;
using Khazana.Identity.Application.Persistence;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Khazana.Identity.Application;

/// <summary>A challenge handed to the app, and the id it must send back with the answer.</summary>
public sealed record PasskeyChallenge(Guid ChallengeId, string OptionsJson);

/// <summary>A passkey whose attestation was verified at sign-up, not yet stored.</summary>
public sealed record NewPasskey(Guid UserId, byte[] CredentialId, byte[] PublicKey, uint SignCount, Guid AaGuid);

/// <summary>
/// Passkeys (WebAuthn): the phishing-resistant sign-in the design prefers
/// (NIST SP 800-63B AAL3-capable). A passkey is added while signed in, or
/// creates the account on its own (sign-up), then signs in with no Google or
/// Apple account involved.
/// </summary>
/// <remarks>
/// User verification (biometric or device PIN) is required both ways, and
/// credentials must be discoverable, so sign-in needs no username. Each
/// challenge is stored, single use, and expires in five minutes.
/// </remarks>
public sealed class PasskeyService(IdentityDbContext db, IFido2 fido2, IClock clock)
{
    public static readonly TimeSpan ChallengeLifetime = TimeSpan.FromMinutes(5);
    private const string Register = "register";
    private const string Assert = "assert";
    private const string SignUp = "signup";

    /// <summary>Options for adding a passkey to a signed-in user.</summary>
    public async Task<PasskeyChallenge> BeginRegistrationAsync(Guid userId, CancellationToken ct)
    {
        var existing = await db.Passkeys.Where(x => x.UserId == userId)
            .Select(x => x.CredentialId).ToListAsync(ct).ConfigureAwait(false);

        var options = CreationOptions(userId, existing);
        return await SaveChallengeAsync(userId, Register, options.ToJson(), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Options for creating an account with a passkey and nothing else. The new
    /// user's id is chosen now and kept in the challenge; no user row exists
    /// until the answer is verified, so an abandoned sign-up leaves nothing.
    /// </summary>
    public async Task<PasskeyChallenge> BeginSignUpAsync(CancellationToken ct)
    {
        var userId = Guid.CreateVersion7();
        return await SaveChallengeAsync(userId, SignUp, CreationOptions(userId, []).ToJson(), ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Verifies a sign-up answer. Returns the passkey for the caller to store
    /// with the new user and their first session, in one transaction.
    /// </summary>
    public async Task<NewPasskey> VerifySignUpAsync(Guid challengeId, AuthenticatorAttestationRawResponse response, CancellationToken ct)
    {
        var (json, userId) = await ConsumeSignUpChallengeAsync(challengeId, ct).ConfigureAwait(false);
        var credential = await VerifyAttestationAsync(json, response, "sign-up", ct).ConfigureAwait(false);
        return new NewPasskey(userId, credential.Id, credential.PublicKey, credential.SignCount, credential.AaGuid);
    }

    /// <summary>Verifies the authenticator's answer and stores the new passkey.</summary>
    public async Task CompleteRegistrationAsync(Guid userId, Guid challengeId, AuthenticatorAttestationRawResponse response, CancellationToken ct)
    {
        var json = await ConsumeChallengeAsync(challengeId, Register, userId, ct).ConfigureAwait(false);
        var credential = await VerifyAttestationAsync(json, response, "registration", ct).ConfigureAwait(false);

        var now = clock.UtcNow;
        db.Passkeys.Add(new PasskeyRow
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            CredentialId = credential.Id,
            PublicKey = credential.PublicKey,
            SignCount = credential.SignCount,
            AaGuid = credential.AaGuid,
            CreatedAt = now,
        });
        try
        {
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // The same authenticator registered twice at once: the unique credential id keeps one.
            throw new AuthFailedException(AuthError.InvalidGrant, "Passkey already registered.");
        }
    }

    /// <summary>Deletes challenges that expired more than an hour ago. Returns how many.</summary>
    public Task<int> DeleteExpiredChallengesAsync(CancellationToken ct)
    {
        var cutoff = clock.UtcNow - TimeSpan.FromHours(1);
        return db.WebAuthnChallenges.Where(x => x.ExpiresAt < cutoff).ExecuteDeleteAsync(ct);
    }

    /// <summary>Options for signing in with any passkey on the device (no username).</summary>
    public async Task<PasskeyChallenge> BeginAssertionAsync(CancellationToken ct)
    {
        var options = fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = [],
            UserVerification = UserVerificationRequirement.Required,
        });
        return await SaveChallengeAsync(null, Assert, options.ToJson(), ct).ConfigureAwait(false);
    }

    /// <summary>Verifies a passkey sign-in; returns whose it is.</summary>
    public async Task<Guid> CompleteAssertionAsync(Guid challengeId, AuthenticatorAssertionRawResponse response, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(response);
        var json = await ConsumeChallengeAsync(challengeId, Assert, null, ct).ConfigureAwait(false);
        var passkey = await db.Passkeys.FirstOrDefaultAsync(x => x.CredentialId == response.RawId, ct).ConfigureAwait(false)
            ?? throw new AuthFailedException(AuthError.InvalidGrant, "Unknown passkey.");

        VerifyAssertionResult result;
        try
        {
            result = await fido2.MakeAssertionAsync(new MakeAssertionParams
            {
                AssertionResponse = response,
                OriginalOptions = AssertionOptions.FromJson(json),
                StoredPublicKey = passkey.PublicKey,
                StoredSignatureCounter = (uint)passkey.SignCount,
                // The authenticator names the account it signed for; it must be
                // the one this credential belongs to.
                IsUserHandleOwnerOfCredentialIdCallback = (p, _) =>
                    Task.FromResult(p.UserHandle.AsSpan().SequenceEqual(passkey.UserId.ToByteArray())),
            }, ct).ConfigureAwait(false);
        }
        catch (Fido2VerificationException e)
        {
            // Includes a signature counter that went backwards: a cloned authenticator.
            throw new AuthFailedException(AuthError.InvalidGrant, $"Passkey sign-in refused: {e.Code}.");
        }

        passkey.SignCount = result.SignCount;
        passkey.LastUsedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return passkey.UserId;
    }

    private CredentialCreateOptions CreationOptions(Guid userId, IEnumerable<byte[]> existing) =>
        fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            // The user handle is the opaque user id: no email or name goes to
            // the authenticator, which may sync it to a cloud keychain.
            User = new Fido2User { Id = userId.ToByteArray(), Name = "Khazana", DisplayName = "Khazana" },
            ExcludeCredentials = [.. existing.Select(id => new PublicKeyCredentialDescriptor(id))],
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required,
            },
            AttestationPreference = AttestationConveyancePreference.None,
        });

    private async Task<RegisteredPublicKeyCredential> VerifyAttestationAsync(
        string optionsJson, AuthenticatorAttestationRawResponse response, string what, CancellationToken ct)
    {
        try
        {
            return await fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
            {
                AttestationResponse = response,
                OriginalOptions = CredentialCreateOptions.FromJson(optionsJson),
                IsCredentialIdUniqueToUserCallback = async (p, token) =>
                    !await db.Passkeys.AnyAsync(x => x.CredentialId == p.CredentialId, token).ConfigureAwait(false),
            }, ct).ConfigureAwait(false);
        }
        catch (Fido2VerificationException e)
        {
            throw new AuthFailedException(AuthError.InvalidGrant, $"Passkey {what} refused: {e.Code}.");
        }
    }

    private async Task<PasskeyChallenge> SaveChallengeAsync(Guid? userId, string kind, string optionsJson, CancellationToken ct)
    {
        var row = new WebAuthnChallengeRow
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            Kind = kind,
            OptionsJson = optionsJson,
            ExpiresAt = clock.UtcNow + ChallengeLifetime,
        };
        db.WebAuthnChallenges.Add(row);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);
        return new PasskeyChallenge(row.Id, optionsJson);
    }

    /// <summary>Claims a challenge atomically, so each can answer exactly once.</summary>
    private async Task<string> ConsumeChallengeAsync(Guid challengeId, string kind, Guid? userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var claimed = await db.WebAuthnChallenges
            .Where(x => x.Id == challengeId && x.Kind == kind && x.UserId == userId && x.UsedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct).ConfigureAwait(false);
        if (claimed != 1) throw new AuthFailedException(AuthError.InvalidGrant, "Passkey challenge unknown, used or expired.");
        return await db.WebAuthnChallenges.Where(x => x.Id == challengeId)
            .Select(x => x.OptionsJson).SingleAsync(ct).ConfigureAwait(false);
    }

    /// <summary>Claims a sign-up challenge (whose user doesn't exist yet) and returns the reserved id.</summary>
    private async Task<(string OptionsJson, Guid UserId)> ConsumeSignUpChallengeAsync(Guid challengeId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var claimed = await db.WebAuthnChallenges
            .Where(x => x.Id == challengeId && x.Kind == SignUp && x.UsedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct).ConfigureAwait(false);
        if (claimed != 1) throw new AuthFailedException(AuthError.InvalidGrant, "Passkey challenge unknown, used or expired.");
        var row = await db.WebAuthnChallenges.Where(x => x.Id == challengeId)
            .Select(x => new { x.OptionsJson, x.UserId }).SingleAsync(ct).ConfigureAwait(false);
        return (row.OptionsJson, row.UserId!.Value);
    }
}
