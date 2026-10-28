namespace Khazana.Gateway;

public static class GatewayPolicies
{
    public const string Public = "public";

    /// <summary>Sign-in, refresh and account deletion: tighter, as each attempt is worth guessing.</summary>
    public const string Auth = "auth";

    /// <summary>
    /// Asking for an SMS code. Every request can cost a text message, so this is
    /// far tighter than <see cref="Auth"/>: per client address, over fifteen minutes.
    /// </summary>
    public const string PhoneOtp = "phone_otp";

    /// <summary>A signed-in user's own data (devices, keys, sync): generous, still bounded.</summary>
    public const string User = "user";

    /// <summary>Calls that cost money at a partner (AA consents and fetches, credit pulls): tight, per user (design doc §7.3).</summary>
    public const string Costly = "costly";
}

/// <summary>
/// Headers on every response leaving the gateway. The API serves JSON only, so
/// the strictest settings cost nothing: nothing may frame it, sniff it into
/// HTML, or load anything from it.
/// </summary>
public sealed class SecurityHeaders(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var h = context.Response.Headers;
        h.XContentTypeOptions = "nosniff";
        h.XFrameOptions = "DENY";
        h["Referrer-Policy"] = "no-referrer";
        h.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
        h["Cross-Origin-Resource-Policy"] = "same-site";
        return next(context);
    }
}
