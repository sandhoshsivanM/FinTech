using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Khazana.AuditReporting.Domain;

/// <summary>One audit record: who did what to what, when, and why.</summary>
/// <param name="Actor"><c>system:&lt;service&gt;</c>, <c>user:&lt;id&gt;</c> or <c>admin:&lt;email&gt;</c>.</param>
/// <param name="Target">An id (<c>user:…</c>, <c>device:…</c>) or a page, never content.</param>
public sealed record AuditEntry(DateTimeOffset At, string Actor, string Action, string Target, string? Reason);

/// <summary>
/// Tamper evidence for the audit log. Each record's MAC covers the previous
/// record's, so editing, deleting or reordering any record breaks every MAC
/// after it. The database also refuses UPDATE and DELETE on the table.
/// </summary>
/// <remarks>
/// Version 2 is HMAC-SHA-256 under a key from the secret store, which the
/// database never holds: someone who can write rows (a leaked database login,
/// a superuser) can't recompute the chain after rewriting it. Version 1, plain
/// SHA-256, could be recomputed by anyone; it is still verified for the rows
/// written before the key existed.
/// </remarks>
public static class AuditChain
{
    public static readonly byte[] Genesis = new byte[32];

    public const int CurrentVersion = 2;

    /// <summary>JSON keeps field boundaries unambiguous ("ab"+"c" never equals "a"+"bc").</summary>
    private static byte[] Canonical(AuditEntry entry, string version) => JsonSerializer.SerializeToUtf8Bytes(new object?[]
    {
        version, ToStoredPrecision(entry.At).ToString("O", System.Globalization.CultureInfo.InvariantCulture),
        entry.Actor, entry.Action, entry.Target, entry.Reason,
    });

    /// <summary>The current (keyed) link.</summary>
    public static byte[] Hash(byte[] previous, AuditEntry entry, byte[] key)
    {
        ArgumentNullException.ThrowIfNull(previous);
        ArgumentNullException.ThrowIfNull(entry);
        ArgumentNullException.ThrowIfNull(key);
        byte[] message = [.. previous, .. Canonical(entry, "v2")];
        return HMACSHA256.HashData(key, message);
    }

    /// <summary>The original, unkeyed link, for verifying old rows only.</summary>
    public static byte[] HashV1(byte[] previous, AuditEntry entry)
    {
        ArgumentNullException.ThrowIfNull(previous);
        ArgumentNullException.ThrowIfNull(entry);
        return SHA256.HashData([.. previous, .. Canonical(entry, "v1")]);
    }

    /// <summary>
    /// Postgres keeps timestamps to the microsecond; .NET clocks on Linux tick
    /// every 100 ns. The hash must cover what is stored, or every record read
    /// back would fail verification (it did, on the Linux CI runners).
    /// </summary>
    public static DateTimeOffset ToStoredPrecision(DateTimeOffset at)
    {
        var ticks = at.UtcTicks;
        return new DateTimeOffset(ticks - (ticks % 10), TimeSpan.Zero);
    }

    /// <summary>The position of the first record whose hash doesn't follow from the one before it, or null if the chain holds.</summary>
    public static int? FirstBrokenLink(IReadOnlyList<(byte[] PreviousHash, byte[] Hash, AuditEntry Entry, int Version)> chain, byte[] key)
    {
        ArgumentNullException.ThrowIfNull(chain);
        var expectedPrevious = Genesis;
        var seenV2 = false;
        for (var i = 0; i < chain.Count; i++)
        {
            var (prev, hash, entry, version) = chain[i];
            // Once keyed links start, an unkeyed one is a forgery, not an old row.
            if (version == 1 && seenV2) return i;
            seenV2 |= version == 2;
            var expected = version == 2 ? Hash(prev, entry, key) : HashV1(prev, entry);
            if (!prev.AsSpan().SequenceEqual(expectedPrevious) || !CryptographicOperations.FixedTimeEquals(hash, expected)) return i;
            expectedPrevious = hash;
        }
        return null;
    }
}

/// <summary>The audit MAC key, derived from <c>Reporting:AuditKey</c> (secret store).</summary>
public sealed class AuditKey
{
    public const int MinSecretLength = 32;

    public AuditKey(string? secret)
    {
        if (string.IsNullOrEmpty(secret) || secret.Length < MinSecretLength)
            throw new InvalidOperationException($"Reporting:AuditKey must be at least {MinSecretLength} characters of random data.");
        Bytes = HKDF.DeriveKey(HashAlgorithmName.SHA256, System.Text.Encoding.UTF8.GetBytes(secret), 32, info: "khazana.audit-chain.v2"u8.ToArray());
    }

    public byte[] Bytes { get; }
}

public static partial class ReportingRules
{
    /// <summary>CERT-In Directions (2022): keep logs 180 days.</summary>
    public static readonly TimeSpan SigninRetention = TimeSpan.FromDays(180);

    [GeneratedRegex("^(system|user|admin):[A-Za-z0-9@._+-]{1,128}$")]
    private static partial Regex ActorPattern();

    [GeneratedRegex("^[a-z][a-z0-9_.]{2,63}$")]
    private static partial Regex ActionPattern();

    /// <summary>Audit fields are ids and codes; free text is limited to a short reason.</summary>
    public static bool IsValid(AuditEntry entry) =>
        entry is not null &&
        ActorPattern().IsMatch(entry.Actor ?? string.Empty) &&
        ActionPattern().IsMatch(entry.Action ?? string.Empty) &&
        entry.Target is { Length: > 0 and <= 128 } && !entry.Target.Any(char.IsControl) &&
        (entry.Reason is null || (entry.Reason.Length <= 280 && !entry.Reason.Any(char.IsControl)));
}
