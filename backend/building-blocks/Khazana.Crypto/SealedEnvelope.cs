using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Khazana.Crypto;

/// <summary>
/// What goes inside a sealed inbox payload: the data, plus the payload id and
/// kind the app checks against the inbox entry it came from.
/// </summary>
/// <typeparam name="T">The normalised data (a bank-data bundle, a credit report).</typeparam>
public sealed record SealedEnvelope<T>(Guid PayloadId, string Kind, T Data);

public static class SealedEnvelope
{
    /// <summary>The wire format inside the box: snake_case JSON, dates as ISO 8601, money already strings.</summary>
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    /// <summary>
    /// Serialises and seals in one step, then wipes the serialised plaintext.
    /// The object graph itself is left to the caller, who should drop it at once.
    /// </summary>
    public static byte[] Seal<T>(byte[] deliveryKey, Guid payloadId, string kind, T data)
    {
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(new SealedEnvelope<T>(payloadId, kind, data), Json);
        try
        {
            return DeliveryBox.Seal(deliveryKey, plaintext);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }
    }

    /// <summary>The app's side, for tests: open and check the payload is the one it was listed as.</summary>
    public static T Open<T>(byte[] sealedBytes, byte[] publicKey, byte[] privateKey, Guid expectedId, string expectedKind)
    {
        var envelope = JsonSerializer.Deserialize<SealedEnvelope<T>>(DeliveryBox.Open(sealedBytes, publicKey, privateKey), Json)
            ?? throw new CryptographicException("Empty payload.");
        if (envelope.PayloadId != expectedId || envelope.Kind != expectedKind)
            throw new CryptographicException("The payload is not the one the inbox listed.");
        return envelope.Data;
    }
}
