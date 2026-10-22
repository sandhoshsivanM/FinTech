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
