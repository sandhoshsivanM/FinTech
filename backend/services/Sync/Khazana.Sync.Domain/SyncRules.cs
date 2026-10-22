using System.Text.RegularExpressions;

namespace Khazana.Sync.Domain;

/// <summary>
/// One encrypted record as a device pushes it (design doc §8.4). Only the
/// routing metadata is readable: which record, which collection, when the
/// device last changed it, whether it is deleted, and the key version. The
/// data itself is AES-256-GCM ciphertext the server cannot open.
/// </summary>
public sealed record IncomingRecord(
    string RecordId, string Collection, DateTimeOffset ClientUpdatedAt, bool Deleted, byte[] Ciphertext, int KeyVersion);

public static partial class SyncRules
{
    /// <summary>Records per push (design doc §8.4).</summary>
    public const int MaxBatch = 500;

    /// <summary>Records per pull page.</summary>
    public const int MaxPage = 500;

    /// <summary>A record larger than this goes to blob storage as an attachment instead.</summary>
    public const int MaxCiphertextBytes = 64 * 1024;

    /// <summary>The smallest real AES-GCM ciphertext: a 12-byte nonce and a 16-byte tag.</summary>
    public const int MinCiphertextBytes = 28;

    /// <summary>A whole push body: 500 records can't all be 64 KB.</summary>
    public const long MaxPushBodyBytes = 4 * 1024 * 1024;

    /// <summary>Deleted records are kept this long so offline devices learn of the deletion.</summary>
    public static readonly TimeSpan TombstoneRetention = TimeSpan.FromDays(90);

    /// <summary>
    /// How far a device clock may run ahead. Conflicts resolve by
    /// <c>updatedAt</c>, so a record stamped in the year 9999 would win every
    /// future edit; anything further ahead than this is refused.
    /// </summary>
    public static readonly TimeSpan MaxClockAhead = TimeSpan.FromMinutes(5);

    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex RecordIdPattern();

    [GeneratedRegex("^[a-z][a-z0-9_]{0,31}$")]
    private static partial Regex CollectionPattern();

    /// <summary>Why a batch is refused, or null when it is acceptable.</summary>
    public static string? Validate(IReadOnlyList<IncomingRecord> records, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(records);
        if (records.Count is 0 or > MaxBatch) return $"A push holds 1 to {MaxBatch} records.";

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in records)
        {
            if (r is null) return "Null record.";
            if (!RecordIdPattern().IsMatch(r.RecordId ?? string.Empty)) return "Bad record id.";
            if (!seen.Add(r.RecordId!)) return "The same record twice in one push.";
            if (!CollectionPattern().IsMatch(r.Collection ?? string.Empty)) return "Bad collection name.";
            if (r.KeyVersion < 1) return "Bad key version.";
            if (r.ClientUpdatedAt > now + MaxClockAhead) return "Record is stamped in the future.";
            var length = r.Ciphertext?.Length ?? 0;
            if (length > MaxCiphertextBytes) return "Record too large; send it as an attachment.";
            if (!r.Deleted && length < MinCiphertextBytes) return "Record is not ciphertext.";
        }
        return null;
    }

    /// <summary>
    /// A device whose cursor is older than the newest purged tombstone may have
    /// missed a deletion. It must resync from zero rather than keep a record
    /// every other device has deleted.
    /// </summary>
    public static bool NeedsReset(long since, long purgedThroughSeq) => since > 0 && since < purgedThroughSeq;
}
