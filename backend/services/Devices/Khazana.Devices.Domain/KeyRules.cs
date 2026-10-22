namespace Khazana.Devices.Domain;

/// <summary>
/// What the server accepts as key material. It never sees a usable key: an
/// envelope is the user's data key (DEK) encrypted on the device, either to a
/// device's X25519 public key or to a key derived from the recovery phrase.
/// These checks only keep junk and oversized blobs out.
/// </summary>
public static class KeyRules
{
    /// <summary>libsodium <c>crypto_box_seal</c> to a device's X25519 key.</summary>
    public const string DeviceAlg = "x25519-sealedbox-v1";

    /// <summary>AES-256-GCM under a key derived from the 24-word recovery phrase with Argon2id.</summary>
    public const string RecoveryAlg = "argon2id-aes256gcm-v1";

    /// <summary>An X25519 public key is 32 bytes.</summary>
    public const int PublicKeyBytes = 32;

    /// <summary>The key-check value: HKDF(DEK, "khazana.key-check.v1"), 32 bytes.</summary>
    public const int KeyCheckBytes = 32;

    /// <summary>A sealed 32-byte DEK is 80 bytes; a GCM one with salt and nonce under 128. Room to grow, not to abuse.</summary>
    public const int MinEnvelopeBytes = 48;
    public const int MaxEnvelopeBytes = 512;

    public static bool IsValidPublicKey(byte[]? key) => key is { Length: PublicKeyBytes } && key.Any(b => b != 0);

    public static bool IsValidEnvelope(byte[]? wrapped, string? alg, int keyVersion, bool recovery) =>
        wrapped is { Length: >= MinEnvelopeBytes and <= MaxEnvelopeBytes } &&
        keyVersion >= 1 &&
        alg == (recovery ? RecoveryAlg : DeviceAlg);

    public static bool IsValidKeyCheck(byte[]? check) => check is { Length: KeyCheckBytes };
}

/// <summary>QR pairing: a new device shows a code, an existing device scans it.</summary>
public static class PairingRules
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    /// <summary>128 random bits in the QR: scanned, never typed, so length costs nothing.</summary>
    public const int CodeBytes = 16;
}

public static class DeviceRules
{
    public const int MaxNameLength = 64;
    public const int MaxAppVersionLength = 32;

    /// <summary>How stale <c>last_seen_at</c> may get before a request refreshes it (one write per hour, not per call).</summary>
    public static readonly TimeSpan LastSeenResolution = TimeSpan.FromHours(1);

    public static readonly IReadOnlySet<string> Platforms =
        new HashSet<string>(StringComparer.Ordinal) { "android", "ios", "web", "macos", "windows", "linux" };

    /// <summary>A name the user typed: trimmed, control characters dropped, length capped.</summary>
    public static string CleanName(string? name)
    {
        var cleaned = new string((name ?? string.Empty).Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (cleaned.Length == 0) return "Device";
        return cleaned.Length <= MaxNameLength ? cleaned : cleaned[..MaxNameLength];
    }
}
