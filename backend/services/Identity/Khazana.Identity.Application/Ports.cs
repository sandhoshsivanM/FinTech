using Microsoft.IdentityModel.Tokens;

namespace Khazana.Identity.Application;

/// <summary>
/// Encrypts the few personal fields Identity keeps (email, display name) and
/// produces keyed hashes for looking them up. A copy of the database alone
/// reveals neither who the users are nor which Google or Apple accounts they
/// use.
/// </summary>
public interface IFieldProtector
{
    /// <param name="purpose">Bound into the ciphertext, so an email can't be pasted in as a name.</param>
    byte[] Encrypt(string plaintext, string purpose);

    string Decrypt(byte[] ciphertext, string purpose);

    /// <summary>Keyed, deterministic: equal inputs give equal hashes, for unique indexes and lookups.</summary>
    byte[] Hash(string value, string purpose);
}

/// <summary>Who Google, Apple (or, in development, the dev provider) says signed in.</summary>
/// <param name="Email">Only when the provider says it is verified; otherwise null.</param>
public sealed record ExternalIdentity(string Provider, string Subject, string? Email, string? DisplayName);

/// <summary>Checks an ID token from one sign-in provider.</summary>
public interface IExternalIdentityVerifier
{
    string Provider { get; }

    /// <param name="deviceKeyThumbprint">The DPoP key's thumbprint; an ID token that carries a nonce must carry this one.</param>
    /// <exception cref="ExternalTokenRejectedException">Anything not provably valid.</exception>
    Task<ExternalIdentity> VerifyAsync(string idToken, string deviceKeyThumbprint, CancellationToken cancellationToken);
}

public sealed class ExternalTokenRejectedException : Exception
{
    public ExternalTokenRejectedException() : base("ID token rejected.") { }
    public ExternalTokenRejectedException(string message) : base(message) { }
    public ExternalTokenRejectedException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>The key Identity signs access tokens with, and the keys others may verify them with.</summary>
public interface ISigningKeys
{
    SigningCredentials Current { get; }

    /// <summary>Current and recently retired public keys, published as the JWKS.</summary>
    IReadOnlyList<SecurityKey> ValidationKeys { get; }
}

/// <summary>Values every token carries.</summary>
public sealed record TokenSettings(string Issuer, string Audience);

/// <summary>
/// Sends the sign-in code as an SMS. Free-first adapter (ADR 0003): a log
/// sender now, a real provider later through <c>Providers:Sms</c>. Called
/// directly while the user waits and never through the message bus, so a
/// code is never written to a queue or an outbox table.
/// </summary>
public interface ISmsSender
{
    /// <param name="e164">The destination, like +919876543210.</param>
    /// <param name="code">The 6-digit code.</param>
    /// <exception cref="SmsSendFailedException">The provider did not accept it.</exception>
    Task SendCodeAsync(string e164, string code, CancellationToken cancellationToken);
}

public sealed class SmsSendFailedException : Exception
{
    public SmsSendFailedException() : base("SMS not sent.") { }
    public SmsSendFailedException(string message) : base(message) { }
    public SmsSendFailedException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>Phone sign-in settings the service needs. Built from <c>Identity:Phone</c> at startup.</summary>
/// <param name="AllowedPrefixes">Calling codes that may sign in, like +91.</param>
/// <param name="EchoCode">Return the code in the response (demo only; refused in Production at startup).</param>
public sealed record PhoneOtpSettings(IReadOnlyList<string> AllowedPrefixes, bool EchoCode);
