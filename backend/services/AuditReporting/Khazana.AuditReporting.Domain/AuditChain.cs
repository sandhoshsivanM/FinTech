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
/// Tamper evidence for the audit log. Each record's hash covers the previous
/// record's hash, so editing, deleting or reordering any record breaks every
/// hash after it. The database also refuses UPDATE and DELETE on the table;
/// the chain catches what a privileged insider could still do around that.
/// </summary>
public static class AuditChain
{
    public static readonly byte[] Genesis = new byte[32];

    /// <summary>
    /// SHA-256 over the previous hash and a canonical JSON array of the fields.
    /// JSON keeps field boundaries unambiguous ("ab"+"c" never equals "a"+"bc").
    /// </summary>
    public static byte[] Hash(byte[] previous, AuditEntry entry)
    {
        ArgumentNullException.ThrowIfNull(previous);
        ArgumentNullException.ThrowIfNull(entry);
        var canonical = JsonSerializer.SerializeToUtf8Bytes(new object?[]
        {
            "v1", ToStoredPrecision(entry.At).ToString("O", System.Globalization.CultureInfo.InvariantCulture),
            entry.Actor, entry.Action, entry.Target, entry.Reason,
        });
        return SHA256.HashData([.. previous, .. canonical]);
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
    public static int? FirstBrokenLink(IReadOnlyList<(byte[] PreviousHash, byte[] Hash, AuditEntry Entry)> chain)
    {
        ArgumentNullException.ThrowIfNull(chain);
        var expectedPrevious = Genesis;
        for (var i = 0; i < chain.Count; i++)
        {
            var (prev, hash, entry) = chain[i];
            if (!prev.AsSpan().SequenceEqual(expectedPrevious) || !hash.AsSpan().SequenceEqual(Hash(prev, entry))) return i;
            expectedPrevious = hash;
        }
        return null;
    }
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
