using System.Buffers.Binary;
using System.Formats.Cbor;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.TestKit;

/// <summary>
/// A passkey authenticator in software, enough to drive WebAuthn end to end:
/// it creates an ES256 credential ("none" attestation) and signs assertions
/// exactly as a phone's platform authenticator would, so the server code under
/// test runs the real verification.
/// </summary>
public sealed class SoftwareAuthenticator(string rpId, string origin) : IDisposable
{
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly byte[] _credentialId = RandomNumberGenerator.GetBytes(32);
    private byte[] _userHandle = [];

    public uint SignCount { get; set; }

    /// <summary>Answers <c>navigator.credentials.create</c> options with a new credential.</summary>
    public JsonObject Create(JsonElement options)
    {
        var challenge = options.GetProperty("challenge").GetString()!;
        _userHandle = Base64UrlEncoder.DecodeBytes(options.GetProperty("user").GetProperty("id").GetString()!);
        var clientData = ClientData("webauthn.create", challenge);

        var p = _key.ExportParameters(false);
        var cose = new CborWriter(CborConformanceMode.Ctap2Canonical);
        cose.WriteStartMap(5);
        cose.WriteInt32(1); cose.WriteInt32(2);   // kty: EC2
        cose.WriteInt32(3); cose.WriteInt32(-7);  // alg: ES256
        cose.WriteInt32(-1); cose.WriteInt32(1);  // crv: P-256
        cose.WriteInt32(-2); cose.WriteByteString(p.Q.X!);
        cose.WriteInt32(-3); cose.WriteByteString(p.Q.Y!);
        cose.WriteEndMap();

        var attested = new List<byte>();
        attested.AddRange(new byte[16]); // AAGUID: none
        attested.AddRange(BigEndian((ushort)_credentialId.Length));
        attested.AddRange(_credentialId);
        attested.AddRange(cose.Encode());
        var authData = AuthenticatorData(flags: 0x45, attested.ToArray()); // UP | UV | AT

        var attestation = new CborWriter(CborConformanceMode.Ctap2Canonical);
        attestation.WriteStartMap(3);
        attestation.WriteTextString("fmt"); attestation.WriteTextString("none");
        attestation.WriteTextString("attStmt"); attestation.WriteStartMap(0); attestation.WriteEndMap();
        attestation.WriteTextString("authData"); attestation.WriteByteString(authData);
        attestation.WriteEndMap();

        return new JsonObject
        {
            ["id"] = Base64UrlEncoder.Encode(_credentialId),
            ["rawId"] = Base64UrlEncoder.Encode(_credentialId),
            ["type"] = "public-key",
            ["response"] = new JsonObject
            {
                ["attestationObject"] = Base64UrlEncoder.Encode(attestation.Encode()),
                ["clientDataJSON"] = Base64UrlEncoder.Encode(clientData),
            },
            ["clientExtensionResults"] = new JsonObject(),
        };
    }

    /// <summary>Answers <c>navigator.credentials.get</c> options with a signed assertion.</summary>
    public JsonObject Get(JsonElement options)
    {
        var clientData = ClientData("webauthn.get", options.GetProperty("challenge").GetString()!);
        SignCount++;
        var authData = AuthenticatorData(flags: 0x05, []); // UP | UV
        var signed = authData.Concat(SHA256.HashData(clientData)).ToArray();
        var signature = _key.SignData(signed, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);

        return new JsonObject
        {
            ["id"] = Base64UrlEncoder.Encode(_credentialId),
            ["rawId"] = Base64UrlEncoder.Encode(_credentialId),
            ["type"] = "public-key",
            ["response"] = new JsonObject
            {
                ["authenticatorData"] = Base64UrlEncoder.Encode(authData),
                ["clientDataJSON"] = Base64UrlEncoder.Encode(clientData),
                ["signature"] = Base64UrlEncoder.Encode(signature),
                ["userHandle"] = Base64UrlEncoder.Encode(_userHandle),
            },
            ["clientExtensionResults"] = new JsonObject(),
        };
    }

    private byte[] ClientData(string type, string challenge) => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new Dictionary<string, object>
    {
        ["type"] = type, ["challenge"] = challenge, ["origin"] = origin, ["crossOrigin"] = false,
    }));

    private byte[] AuthenticatorData(byte flags, byte[] attested)
    {
        var data = new List<byte>(SHA256.HashData(Encoding.UTF8.GetBytes(rpId))) { flags };
        data.AddRange(BigEndian(SignCount));
        data.AddRange(attested);
        return [.. data];
    }

    private static byte[] BigEndian(ushort v)
    {
        var b = new byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(b, v);
        return b;
    }

    private static byte[] BigEndian(uint v)
    {
        var b = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(b, v);
        return b;
    }

    public void Dispose() => _key.Dispose();
}
