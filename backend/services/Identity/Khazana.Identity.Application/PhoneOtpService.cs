using System.Security.Cryptography;
using Khazana.Identity.Application.Persistence;
using Khazana.Identity.Domain;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Khazana.Identity.Application;

/// <summary>What the app gets after asking for a code.</summary>
/// <param name="DemoCode">Only when the server is configured to echo (demo); otherwise null.</param>
public sealed record PhoneChallenge(Guid ChallengeId, int ExpiresInSeconds, int ResendAfterSeconds, string? DemoCode);

/// <summary>
/// Sign-in with a mobile number and an SMS code (ADR 0004, amended). A
/// convenience sign-in: it gives a session like any other, but never step-up,
/// and never the data key (that comes from pairing or the recovery phrase).
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item>Asking for a code never looks up the account, so the answer is the
/// same for a known and an unknown number (no enumeration).</item>
/// <item>Texts cost money and an SMS can be intercepted (SIM swap), so: a gap
/// between texts, caps per number and per device key, 5 tries per code, a
/// 5-minute life, one use, and the code bound to the asking device key.</item>
/// <item>The code is stored only as a keyed hash and compared in constant time.</item>
/// </list>
/// </remarks>
public sealed partial class PhoneOtpService(
    IdentityDbContext db, IFieldProtector protector, IClock clock, IEnumerable<ISmsSender> senders,
    PhoneOtpSettings settings, ILogger<PhoneOtpService> log)
{
    private const string PhonePurpose = "identity.otp-phone";
    private const string PhoneHashPurpose = "identity.otp-phone-hash";
    private const string CodePurpose = "identity.otp-code";
    private readonly ISmsSender? _sender = senders.FirstOrDefault();

    public bool Enabled => _sender is not null;

    /// <summary>Creates a code and texts it. Throws <see cref="AuthFailedException"/> when refused.</summary>
    public async Task<PhoneChallenge> StartAsync(string? phone, string jkt, CancellationToken ct)
    {
        if (_sender is null) throw new AuthFailedException(AuthError.UnsupportedProvider, "Phone sign-in is not enabled.");
        var e164 = PhoneNumbers.Normalize(phone, settings.AllowedPrefixes)
            ?? throw new AuthFailedException(AuthError.InvalidPhone, "Not an allowed mobile number.");
        var phoneHash = protector.Hash(e164, PhoneHashPurpose);

        var code = RandomNumberGenerator.GetInt32(1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
        PhoneOtpChallengeRow row;
        await using (var tx = await db.Database.BeginTransactionAsync(ct).ConfigureAwait(false))
        {
            // One request per number at a time, so two at once can't both pass the counts below.
            await db.Database.ExecuteSqlAsync(
                $"SELECT pg_advisory_xact_lock(hashtextextended({Convert.ToHexString(phoneHash)}, 1))", ct).ConfigureAwait(false);
            var now = clock.UtcNow;
            await EnforceLimitsAsync(phoneHash, jkt, now, ct).ConfigureAwait(false);

            var id = Guid.CreateVersion7();
            row = new PhoneOtpChallengeRow
            {
                Id = id,
                PhoneHash = phoneHash,
                PhoneEnc = protector.Encrypt(e164, PhonePurpose),
                CodeHash = CodeHash(id, code),
                Jkt = jkt,
                CreatedAt = now,
                ExpiresAt = now + PhoneOtpRules.Lifetime,
            };
            db.PhoneOtpChallenges.Add(row);
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            await tx.CommitAsync(ct).ConfigureAwait(false);
        }

        try
        {
            await _sender.SendCodeAsync(e164, code, ct).ConfigureAwait(false);
        }
        catch (SmsSendFailedException e)
        {
            // Nothing was delivered, so the code is void and the failed send does not count against the number.
            SendFailed(log, PhoneNumbers.Mask(e164), e.Message);
            await db.PhoneOtpChallenges.Where(x => x.Id == row.Id).ExecuteDeleteAsync(CancellationToken.None).ConfigureAwait(false);
            throw new AuthFailedException(AuthError.TemporarilyUnavailable, "SMS provider failed.");
        }
        return new PhoneChallenge(
            row.Id, (int)PhoneOtpRules.Lifetime.TotalSeconds, (int)PhoneOtpRules.ResendCooldown.TotalSeconds,
            settings.EchoCode ? code : null);
    }

    /// <summary>
    /// Checks a code. A wrong code spends one of five tries; the right code is
    /// spent at once, so it works exactly one time. Returns the verified number
    /// as an identity for <see cref="SessionService"/>.
    /// </summary>
    public async Task<ExternalIdentity> VerifyAsync(Guid challengeId, string? code, string jkt, CancellationToken ct)
    {
        if (!PhoneOtpRules.IsWellFormed(code)) throw new AuthFailedException(AuthError.InvalidRequest, "Malformed code.");
        var now = clock.UtcNow;
        var row = await db.PhoneOtpChallenges.AsNoTracking().FirstOrDefaultAsync(x => x.Id == challengeId, ct).ConfigureAwait(false);
        if (row is null || row.UsedAt is not null || row.ExpiresAt <= now || row.Attempts >= PhoneOtpRules.MaxVerifyAttempts ||
            !string.Equals(row.Jkt, jkt, StringComparison.Ordinal))
            throw new AuthFailedException(AuthError.InvalidGrant, "Code challenge unknown, used, expired, exhausted or for another device.");

        // Spend a try first, atomically, so parallel guesses can't exceed the cap.
        var spent = await db.PhoneOtpChallenges
            .Where(x => x.Id == challengeId && x.UsedAt == null && x.ExpiresAt > now && x.Attempts < PhoneOtpRules.MaxVerifyAttempts)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Attempts, x => x.Attempts + 1), ct).ConfigureAwait(false);
        if (spent != 1) throw new AuthFailedException(AuthError.InvalidGrant, "Code challenge exhausted or used.");

        if (!CryptographicOperations.FixedTimeEquals(row.CodeHash, CodeHash(challengeId, code!)))
            throw new AuthFailedException(AuthError.InvalidGrant, "Wrong code.");

        var used = await db.PhoneOtpChallenges.Where(x => x.Id == challengeId && x.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct).ConfigureAwait(false);
        if (used != 1) throw new AuthFailedException(AuthError.InvalidGrant, "Code already used.");

        var e164 = protector.Decrypt(row.PhoneEnc, PhonePurpose);
        return new ExternalIdentity(Providers.Phone, e164, null, null);
    }

    /// <summary>Deletes codes older than a day plus a margin (the daily cap counts them until then). Returns how many.</summary>
    public Task<int> DeleteOldAsync(CancellationToken ct)
    {
        var cutoff = clock.UtcNow - PhoneOtpRules.Day - TimeSpan.FromHours(1);
        return db.PhoneOtpChallenges.Where(x => x.CreatedAt < cutoff).ExecuteDeleteAsync(ct);
    }

    private async Task EnforceLimitsAsync(byte[] phoneHash, string jkt, DateTimeOffset now, CancellationToken ct)
    {
        var dayAgo = now - PhoneOtpRules.Day;
        var byPhone = await db.PhoneOtpChallenges.Where(x => x.PhoneHash == phoneHash && x.CreatedAt > dayAgo)
            .Select(x => x.CreatedAt).ToListAsync(ct).ConfigureAwait(false);
        var byDevice = await db.PhoneOtpChallenges.Where(x => x.Jkt == jkt && x.CreatedAt > dayAgo)
            .Select(x => x.CreatedAt).ToListAsync(ct).ConfigureAwait(false);

        Check(byPhone, PhoneOtpRules.PerPhoneWindowLimit, PhoneOtpRules.PerPhoneDayLimit, now, "number", cooldown: true);
        Check(byDevice, PhoneOtpRules.PerDeviceWindowLimit, PhoneOtpRules.PerDeviceDayLimit, now, "device", cooldown: false);
    }

    private static void Check(List<DateTimeOffset> times, int windowLimit, int dayLimit, DateTimeOffset now, string what, bool cooldown)
    {
        if (times.Count == 0) return;
        if (cooldown)
        {
            var wait = PhoneOtpRules.ResendCooldown - (now - times.Max());
            if (wait > TimeSpan.Zero) throw TooMany(wait, $"Resend cooldown for this {what}.");
        }
        var inWindow = times.Where(t => t > now - PhoneOtpRules.PerPhoneWindow).Order().ToList();
        if (inWindow.Count >= windowLimit)
            throw TooMany(inWindow[inWindow.Count - windowLimit] + PhoneOtpRules.PerPhoneWindow - now, $"Window limit for this {what}.");
        if (times.Count >= dayLimit)
        {
            var ordered = times.Order().ToList();
            throw TooMany(ordered[ordered.Count - dayLimit] + PhoneOtpRules.Day - now, $"Daily limit for this {what}.");
        }
    }

    private static AuthFailedException TooMany(TimeSpan wait, string why) =>
        new(AuthError.TooManyRequests, why, Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds)));

    private byte[] CodeHash(Guid challengeId, string code) => protector.Hash($"{challengeId:N}:{code}", CodePurpose);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SMS to {Phone} was not sent: {Reason}")]
    private static partial void SendFailed(ILogger logger, string phone, string reason);
}
