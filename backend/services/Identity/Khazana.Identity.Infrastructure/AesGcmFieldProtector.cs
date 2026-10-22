using System.Security.Cryptography;
using System.Text;
using Khazana.Identity.Application;

namespace Khazana.Identity.Infrastructure;

/// <summary>
/// AES-256-GCM for personal fields, HMAC-SHA-256 for lookups, both from one
/// configured secret through HKDF with separate labels, so the encryption key
/// and the hashing key are never the same bytes.
/// </summary>
/// <remarks>
/// Ciphertext layout: <c>version (1) | nonce (12) | ciphertext | tag (16)</c>,
/// with the purpose as associated data. The version byte lets the key rotate
/// later without guessing which rows are old. In the cloud the secret comes
/// from AWS Secrets Manager (and later a KMS data key), never from the repo.
/// </remarks>
public sealed class AesGcmFieldProtector : IFieldProtector
{
    private const byte Version = 1;
    private const int NonceSize = 12;
    private const int TagSize = 16;

    /// <summary>Shorter secrets are refused at startup.</summary>
    public const int MinSecretLength = 32;

    private readonly byte[] _encryptionKey;
    private readonly byte[] _hashKey;

    public AesGcmFieldProtector(string secret)
    {
        if (string.IsNullOrEmpty(secret) || secret.Length < MinSecretLength)
            throw new InvalidOperationException(
                $"Identity:Secrets:FieldKey must be at least {MinSecretLength} characters of random data.");
        var ikm = Encoding.UTF8.GetBytes(secret);
        _encryptionKey = HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, 32, info: "khazana.identity.field-encryption.v1"u8.ToArray());
        _hashKey = HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, 32, info: "khazana.identity.field-hash.v1"u8.ToArray());
    }

    public byte[] Encrypt(string plaintext, string purpose)
    {
        ArgumentNullException.ThrowIfNull(plaintext);
        var data = Encoding.UTF8.GetBytes(plaintext);
        var output = new byte[1 + NonceSize + data.Length + TagSize];
        output[0] = Version;
        var nonce = output.AsSpan(1, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(_encryptionKey, TagSize);
        aes.Encrypt(nonce, data, output.AsSpan(1 + NonceSize, data.Length),
            output.AsSpan(1 + NonceSize + data.Length, TagSize), Encoding.UTF8.GetBytes(purpose));
        return output;
    }

    public string Decrypt(byte[] ciphertext, string purpose)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        if (ciphertext.Length < 1 + NonceSize + TagSize || ciphertext[0] != Version)
            throw new CryptographicException("Unknown field ciphertext format.");
        var length = ciphertext.Length - 1 - NonceSize - TagSize;
        var plain = new byte[length];
        using var aes = new AesGcm(_encryptionKey, TagSize);
        aes.Decrypt(ciphertext.AsSpan(1, NonceSize), ciphertext.AsSpan(1 + NonceSize, length),
            ciphertext.AsSpan(1 + NonceSize + length, TagSize), plain, Encoding.UTF8.GetBytes(purpose));
        return Encoding.UTF8.GetString(plain);
    }

    public byte[] Hash(string value, string purpose)
    {
        ArgumentNullException.ThrowIfNull(value);
        ArgumentNullException.ThrowIfNull(purpose);
        // The purpose is length-prefixed so ("ab", "c") and ("a", "bc") differ.
        return HMACSHA256.HashData(_hashKey, Encoding.UTF8.GetBytes($"{purpose.Length}:{purpose}:{value}"));
    }
}
