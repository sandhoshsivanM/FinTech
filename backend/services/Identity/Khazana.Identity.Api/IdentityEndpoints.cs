using System.Text.Json;
using Fido2NetLib;
using Khazana.Identity.Application;
using Khazana.Identity.Domain;
using Khazana.Security;
using Khazana.Security.Dpop;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Khazana.Identity.Api;

// Request and response bodies. JSON is snake_case (OAuth's convention) and an
// unknown field fails the request (Program.cs), so a client bug is loud.

/// <param name="Provider">google | apple | passkey (dev in Development).</param>
/// <param name="IdToken">The provider's ID token (google, apple, dev).</param>
/// <param name="ChallengeId">From <c>/passkeys/assert/options</c> (passkey).</param>
/// <param name="Assertion">The authenticator's response, as the platform API returns it (passkey).</param>
public sealed record TokenRequest(string Provider, string Platform, string? IdToken = null, Guid? ChallengeId = null, JsonElement? Assertion = null);

public sealed record RefreshRequest(string RefreshToken);

public sealed record LogoutRequest(bool Everywhere);

public sealed record PasskeyRegistration(Guid ChallengeId, JsonElement? Attestation = null);

public sealed record TokenResponse(
    string AccessToken, string TokenType, int ExpiresIn, string RefreshToken, Guid UserId, Guid DeviceId);

public sealed record ChallengeResponse(Guid ChallengeId, JsonElement Options);

public sealed record DeletionResponse(DateTimeOffset ExecuteAfter);

public sealed record ErrorResponse(string Error);

public static class IdentityEndpoints
{
    public static void MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/v1/auth");
        auth.MapPost("/token", Token);
        auth.MapPost("/refresh", Refresh);
        auth.MapPost("/logout", Logout).RequireAuthorization();
        // Adding a passkey adds a way into the account: it needs a live session
        // from a sign-in in the last few minutes, not just an unexpired token.
        auth.MapPost("/passkeys/register/options", BeginPasskeyRegistration).RequireAuthorization()
            .AddEndpointFilter(RequireLiveSession(SessionService.FreshSignIn));
        auth.MapPost("/passkeys/register", CompletePasskeyRegistration).RequireAuthorization()
            .AddEndpointFilter(RequireLiveSession(SessionService.FreshSignIn));
        auth.MapPost("/passkeys/assert/options", BeginPasskeyAssertion);

        app.MapDelete("/v1/account", RequestDeletion).RequireAuthorization().AddEndpointFilter(RequireLiveSession(null));
        app.MapPost("/v1/account/restore", Restore);

        // Internal only: the gateway does not route /.well-known. Services fetch
        // Identity's public keys from here to check tokens themselves.
        app.MapGet("/.well-known/openid-configuration", Discovery);
        app.MapGet("/.well-known/jwks.json", Jwks);
    }

    /// <summary>Signs in with Google, Apple, a passkey or (Development) a dev token.</summary>
    private static Task<IResult> Token(
        TokenRequest body, HttpContext http, DpopProofValidator dpop, IOptions<KhazanaAuthOptions> authOptions,
        IEnumerable<IExternalIdentityVerifier> verifiers, SessionService sessions, PasskeyService passkeys,
        ILogger<TokenRequest> log, CancellationToken ct) =>
        SignInAsync(body, http, dpop, authOptions, verifiers, passkeys, log, "Sign-in",
            (identity, jkt) => sessions.SignInExternalAsync(identity, jkt, body.Platform, ct),
            (userId, jkt) => sessions.SignInPasskeyAsync(userId, jkt, body.Platform, ct), ct);

    /// <summary>
    /// Changes one's mind during the cooling-off: prove who you are again
    /// (the same body as <c>/v1/auth/token</c>) and the deletion is cancelled.
    /// </summary>
    private static Task<IResult> Restore(
        TokenRequest body, HttpContext http, DpopProofValidator dpop, IOptions<KhazanaAuthOptions> authOptions,
        IEnumerable<IExternalIdentityVerifier> verifiers, SessionService sessions, PasskeyService passkeys,
        ILogger<TokenRequest> log, CancellationToken ct) =>
        SignInAsync(body, http, dpop, authOptions, verifiers, passkeys, log, "Restore",
            (identity, jkt) => sessions.RestoreExternalAsync(identity, jkt, body.Platform, ct),
            (userId, jkt) => sessions.RestorePasskeyAsync(userId, jkt, body.Platform, ct), ct);

    private static async Task<IResult> SignInAsync(
        TokenRequest body, HttpContext http, DpopProofValidator dpop, IOptions<KhazanaAuthOptions> authOptions,
        IEnumerable<IExternalIdentityVerifier> verifiers, PasskeyService passkeys, ILogger log, string action,
        Func<ExternalIdentity, string, Task<TokenPair>> external, Func<Guid, string, Task<TokenPair>> passkey, CancellationToken ct)
    {
        var proof = await CheckProofAsync(http, dpop, authOptions.Value, log).ConfigureAwait(false);
        if (proof is null) return InvalidProof(http);
        if (body is null || !Platforms.IsKnown(body.Platform)) return Error(AuthError.InvalidRequest);

        try
        {
            TokenPair pair;
            if (body.Provider == Providers.Passkey)
            {
                if (body.ChallengeId is not { } challengeId || body.Assertion is not { } assertion)
                    return Error(AuthError.InvalidRequest);
                var response = DeserializeFido<AuthenticatorAssertionRawResponse>(assertion);
                if (response?.Response is null) return Error(AuthError.InvalidRequest);
                var userId = await passkeys.CompleteAssertionAsync(challengeId, response, ct).ConfigureAwait(false);
                pair = await passkey(userId, proof.Jkt).ConfigureAwait(false);
            }
            else
            {
                var verifier = verifiers.FirstOrDefault(v => v.Provider == body.Provider);
                if (verifier is null) return Error(AuthError.UnsupportedProvider);
                if (string.IsNullOrEmpty(body.IdToken)) return Error(AuthError.InvalidRequest);
                var identity = await verifier.VerifyAsync(body.IdToken, proof.Jkt, ct).ConfigureAwait(false);
                pair = await external(identity, proof.Jkt).ConfigureAwait(false);
            }
            return Tokens(http, pair);
        }
        catch (ExternalTokenRejectedException e)
        {
            Log.Refused(log, action, e.Message);
            return Error(AuthError.InvalidGrant);
        }
        catch (AuthFailedException e)
        {
            Log.Refused(log, action, e.Message);
            return Error(e.Error);
        }
    }

    /// <summary>Rotates a refresh token. Needs a proof from the key the session is bound to.</summary>
    private static async Task<IResult> Refresh(
        RefreshRequest body, HttpContext http, DpopProofValidator dpop, IOptions<KhazanaAuthOptions> authOptions,
        SessionService sessions, ILogger<RefreshRequest> log, CancellationToken ct)
    {
        var proof = await CheckProofAsync(http, dpop, authOptions.Value, log).ConfigureAwait(false);
        if (proof is null) return InvalidProof(http);
        try
        {
            return Tokens(http, await sessions.RefreshAsync(body?.RefreshToken ?? string.Empty, proof.Jkt, ct).ConfigureAwait(false));
        }
        catch (AuthFailedException e)
        {
            Log.Refused(log, "Refresh", e.Message);
            return Error(e.Error);
        }
    }

    private static async Task<IResult> Logout(LogoutRequest body, HttpContext http, SessionService sessions, CancellationToken ct)
    {
        await sessions.LogoutAsync(http.User.UserId(), http.User.DeviceId(), body?.Everywhere ?? false, ct).ConfigureAwait(false);
        return Results.NoContent();
    }

    private static async Task<IResult> BeginPasskeyRegistration(HttpContext http, PasskeyService passkeys, CancellationToken ct) =>
        Challenge(await passkeys.BeginRegistrationAsync(http.User.UserId(), ct).ConfigureAwait(false));

    private static async Task<IResult> CompletePasskeyRegistration(
        PasskeyRegistration body, HttpContext http, PasskeyService passkeys, ILogger<PasskeyRegistration> log, CancellationToken ct)
    {
        if (body?.Attestation is not { ValueKind: JsonValueKind.Object } attestation) return Error(AuthError.InvalidRequest);
        var response = DeserializeFido<AuthenticatorAttestationRawResponse>(attestation);
        if (response?.Response is null) return Error(AuthError.InvalidRequest);
        try
        {
            await passkeys.CompleteRegistrationAsync(http.User.UserId(), body.ChallengeId, response, ct).ConfigureAwait(false);
            return Results.NoContent();
        }
        catch (AuthFailedException e)
        {
            Log.Refused(log, "Passkey registration", e.Message);
            return Error(e.Error);
        }
    }

    private static async Task<IResult> BeginPasskeyAssertion(PasskeyService passkeys, CancellationToken ct) =>
        Challenge(await passkeys.BeginAssertionAsync(ct).ConfigureAwait(false));

    /// <summary>
    /// Starts deletion. The access token proves who asks and the DPoP proof
    /// that it is their device; the app also requires a biometric check before
    /// it lets the device key sign (design doc §14.3).
    /// </summary>
    private static async Task<IResult> RequestDeletion(HttpContext http, SessionService sessions, CancellationToken ct) =>
        Results.Accepted(value: new DeletionResponse(
            await sessions.RequestDeletionAsync(http.User.UserId(), ct).ConfigureAwait(false)));

    private static IResult Discovery(HttpContext http, IOptions<KhazanaAuthOptions> auth) =>
        Results.Json(new Dictionary<string, object>
        {
            ["issuer"] = auth.Value.Issuer,
            ["jwks_uri"] = $"{http.Request.Scheme}://{http.Request.Host}/.well-known/jwks.json",
            ["id_token_signing_alg_values_supported"] = new[] { SecurityAlgorithms.EcdsaSha256 },
        });

    private static IResult Jwks(ISigningKeys keys)
    {
        var jwks = keys.ValidationKeys.Select(k =>
        {
            var jwk = JsonWebKeyConverter.ConvertFromSecurityKey(k);
            return new Dictionary<string, string?>
            {
                ["kty"] = jwk.Kty, ["crv"] = jwk.Crv, ["x"] = jwk.X, ["y"] = jwk.Y,
                ["kid"] = jwk.Kid, ["use"] = "sig", ["alg"] = SecurityAlgorithms.EcdsaSha256,
            };
        });
        return Results.Json(new { keys = jwks });
    }

    private static async Task<DpopProof?> CheckProofAsync(HttpContext http, DpopProofValidator dpop, KhazanaAuthOptions options, ILogger log)
    {
        var headers = http.Request.Headers["DPoP"];
        if (headers.Count != 1) return null;
        try
        {
            return await dpop.ValidateAsync(headers[0], http.Request.Method, http.Request.AcceptedUris(options)).ConfigureAwait(false);
        }
        catch (DpopValidationException e)
        {
            Log.Refused(log, "DPoP proof", e.Message);
            return null;
        }
    }

    /// <summary>Fido2's types carry their own JSON attributes and converters; our snake_case policy must not apply.</summary>
    private static T? DeserializeFido<T>(JsonElement element) where T : class
    {
        try
        {
            return element.Deserialize<T>();
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or NotSupportedException)
        {
            return null;
        }
    }

    private static IResult Tokens(HttpContext http, TokenPair pair)
    {
        // RFC 6749 §5.1: token responses must never be cached.
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers.Pragma = "no-cache";
        return Results.Ok(new TokenResponse(pair.AccessToken, "DPoP", pair.ExpiresIn, pair.RefreshToken, pair.UserId, pair.DeviceId));
    }

    private static IResult Challenge(PasskeyChallenge challenge)
    {
        using var doc = JsonDocument.Parse(challenge.OptionsJson);
        return Results.Ok(new ChallengeResponse(challenge.ChallengeId, doc.RootElement.Clone()));
    }

    private static IResult InvalidProof(HttpContext http)
    {
        http.Response.Headers.WWWAuthenticate = "DPoP error=\"invalid_dpop_proof\", algs=\"ES256\"";
        return Results.Json(new ErrorResponse("invalid_dpop_proof"), statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult Error(AuthError error) => error switch
    {
        AuthError.SessionRevoked => Results.Json(new ErrorResponse("invalid_token"), statusCode: StatusCodes.Status401Unauthorized),
        AuthError.ReauthenticationRequired => Results.Json(new ErrorResponse("reauthentication_required"), statusCode: StatusCodes.Status403Forbidden),
        _ => Results.BadRequest(new ErrorResponse(error switch
        {
            AuthError.InvalidGrant => "invalid_grant",
            AuthError.UnsupportedProvider => "unsupported_provider",
            // The app offers "Restore my account" on this answer (POST /v1/account/restore).
            AuthError.AccountDeletionPending => "account_deletion_pending",
            AuthError.DeletionTooLate => "deletion_in_progress",
            _ => "invalid_request",
        })),
    };

    /// <summary>Refuses a token whose session ended, whose account is being deleted, or (with a max age) whose sign-in is stale.</summary>
    private static Func<EndpointFilterInvocationContext, EndpointFilterDelegate, ValueTask<object?>> RequireLiveSession(TimeSpan? maxAge) =>
        async (context, next) =>
        {
            var http = context.HttpContext;
            try
            {
                await http.RequestServices.GetRequiredService<SessionService>()
                    .RequireLiveSessionAsync(http.User.UserId(), http.User.DeviceId(), maxAge, http.RequestAborted).ConfigureAwait(false);
            }
            catch (AuthFailedException e)
            {
                Log.Refused(http.RequestServices.GetRequiredService<ILogger<SessionService>>(), "Session check", e.Message);
                return Error(e.Error);
            }
            return await next(context).ConfigureAwait(false);
        };
}

/// <summary>Refusals are logged with the reason only: never a token, proof or ID token.</summary>
internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "{Action} refused: {Reason}")]
    public static partial void Refused(ILogger logger, string action, string reason);
}
