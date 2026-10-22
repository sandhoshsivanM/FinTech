namespace Khazana.Gateway;

public static class GatewayPolicies
{
    public const string Public = "public";

    /// <summary>Sign-in, refresh and account deletion: tighter, as each attempt is worth guessing.</summary>
    public const string Auth = "auth";
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
