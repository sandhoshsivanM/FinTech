using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Khazana.Crypto;

/// <summary>
/// Seals bank and credit data to the user's delivery public key (design doc §6
/// key hierarchy, §8.5 "Sealed"). Anyone with the public key can seal; only
/// the holder of the private key (the user's devices, which keep it wrapped
/// under the data key) can open. The server seals, stores the sealed bytes,
/// and has no way to read them back.
/// </summary>
/// <remarks>
/// <para>
/// libsodium's <c>crypto_box_seal</c> (X25519 with a fresh ephemeral key per
/// payload, XSalsa20-Poly1305), the same primitive the apps already use for
/// device key envelopes (<c>x25519-sealedbox-v1</c>, ADR 0005), so they open a
/// payload with <c>crypto_box_seal_open</c> and need no new cryptography. It is
/// called in the libsodium that NSec ships and initialises; nothing is
/// hand-rolled.
/// </para>
/// <para>
/// A sealed box has no associated data, so whoever builds the plaintext puts
/// the payload id and kind inside it, and the app checks them against the
/// inbox entry: a server that swapped two payloads would be caught.
/// </para>
/// </remarks>
public static partial class DeliveryBox
{
    public const string Alg = "x25519-sealedbox-v1";

    public const int PublicKeyBytes = 32;

    /// <summary>crypto_box_SEALBYTES: the ephemeral public key plus the Poly1305 tag.</summary>
    public const int Overhead = 48;

    static DeliveryBox()
    {
        // NSec loads and initialises the same library; this makes the order irrelevant.
        if (NativeMethods.sodium_init() < 0) throw new InvalidOperationException("libsodium failed to initialise.");
    }

    /// <summary>A usable X25519 public key: 32 bytes, not all zero.</summary>
    public static bool IsValidPublicKey(ReadOnlySpan<byte> key) =>
        key.Length == PublicKeyBytes && key.IndexOfAnyExcept((byte)0) >= 0;

    /// <exception cref="ArgumentException">The recipient key is malformed or unusable (a low-order point).</exception>
    public static byte[] Seal(byte[] recipientPublicKey, byte[] plaintext)
    {
        ArgumentNullException.ThrowIfNull(recipientPublicKey);
        ArgumentNullException.ThrowIfNull(plaintext);
        if (!IsValidPublicKey(recipientPublicKey)) throw new ArgumentException("Delivery key must be 32 non-zero bytes.", nameof(recipientPublicKey));
        var sealedBytes = new byte[plaintext.Length + Overhead];
        if (NativeMethods.crypto_box_seal(sealedBytes, plaintext, (ulong)plaintext.Length, recipientPublicKey) != 0)
            throw new ArgumentException("Delivery key is unusable.", nameof(recipientPublicKey));
        return sealedBytes;
    }

    /// <summary>What the app does with its private key. The server never holds one; tests use this.</summary>
    /// <exception cref="CryptographicException">Wrong key or tampered bytes.</exception>
    public static byte[] Open(byte[] sealedBytes, byte[] publicKey, byte[] privateKey)
    {
        ArgumentNullException.ThrowIfNull(sealedBytes);
        ArgumentNullException.ThrowIfNull(publicKey);
        ArgumentNullException.ThrowIfNull(privateKey);
        if (sealedBytes.Length < Overhead || publicKey.Length != PublicKeyBytes || privateKey.Length != PublicKeyBytes)
            throw new CryptographicException("Not a sealed delivery payload.");
        var plaintext = new byte[sealedBytes.Length - Overhead];
        if (NativeMethods.crypto_box_seal_open(plaintext, sealedBytes, (ulong)sealedBytes.Length, publicKey, privateKey) != 0)
            throw new CryptographicException("This payload was not sealed to this key, or was changed.");
        return plaintext;
    }

    /// <summary>A delivery key pair, as the app makes one. For tests.</summary>
    public static (byte[] PublicKey, byte[] PrivateKey) CreateKeyPair()
    {
        var pk = new byte[PublicKeyBytes];
        var sk = new byte[PublicKeyBytes];
        if (NativeMethods.crypto_box_keypair(pk, sk) != 0) throw new CryptographicException("Key generation failed.");
        return (pk, sk);
    }

    private static partial class NativeMethods
    {
        private const string Libsodium = "libsodium";

        [LibraryImport(Libsodium)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.SafeDirectories)]
        internal static partial int sodium_init();

        [LibraryImport(Libsodium)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.SafeDirectories)]
        internal static partial int crypto_box_seal(byte[] c, byte[] m, ulong mlen, byte[] pk);

        [LibraryImport(Libsodium)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.SafeDirectories)]
        internal static partial int crypto_box_seal_open(byte[] m, byte[] c, ulong clen, byte[] pk, byte[] sk);

        [LibraryImport(Libsodium)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.SafeDirectories)]
        internal static partial int crypto_box_keypair(byte[] pk, byte[] sk);
    }
}
