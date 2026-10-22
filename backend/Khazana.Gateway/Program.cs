using System.Threading.RateLimiting;
using Khazana.Gateway;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

// Bodies are small: sign-in requests and, later, sync batches arrive through
// their own size limits; nothing legitimate here is larger.
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    // Cluster addresses like "http://marketdata-api" are resolved by name
    // (Aspire locally, the platform in the cloud), never hard-coded.
    .AddServiceDiscoveryDestinationResolver();

// Behind a load balancer every connection comes from the balancer. The real
// client address is taken from X-Forwarded-For, but only when the request came
// from a proxy listed in Gateway:TrustedProxies (IPs or CIDRs); from anyone
// else the header is ignored, so a client can't pick its own rate-limit bucket.
// With no proxies listed the middleware stays off: ASP.NET treats empty
// proxy lists as "trust everyone", which would let any client choose its bucket.
var trustedProxies = builder.Configuration.GetSection("Gateway:TrustedProxies").Get<string[]>() ?? [];
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.ForwardLimit = 1;
    o.KnownProxies.Clear();
    o.KnownIPNetworks.Clear();
    foreach (var entry in trustedProxies)
    {
        if (entry.Contains('/', StringComparison.Ordinal)) o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(entry));
        else o.KnownProxies.Add(System.Net.IPAddress.Parse(entry));
    }
});

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // A ceiling per client address over everything, on top of each route's own
    // policy: whatever a route's policy keys on, one address can't exceed this.
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var limits = ctx.RequestServices.GetRequiredService<IConfiguration>().GetSection("RateLimits:Global");
        return RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = limits.GetValue("PermitLimit", 1200),
                Window = TimeSpan.FromSeconds(limits.GetValue("WindowSeconds", 60)),
                QueueLimit = 0,
            });
    });
    o.AddPolicy(GatewayPolicies.Public, ctx => PerClientWindow(ctx, "RateLimits:Public", 60));
    o.AddPolicy(GatewayPolicies.Auth, ctx => PerClientWindow(ctx, "RateLimits:Auth", 20));
    o.AddPolicy(GatewayPolicies.User, ctx => PerClientWindow(ctx, "RateLimits:User", 120, UserBucket(ctx)));
});

var app = builder.Build();

if (trustedProxies.Length > 0) app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment()) app.UseHsts();
// Sync pushes are the one large body (up to 500 encrypted records); the limit
// is raised for that path alone, before anything reads the body.
app.Use((context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/v1/sync/push") &&
        context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } body)
        body.MaxRequestBodySize = 4 * 1024 * 1024;
    return next(context);
});
app.UseMiddleware<SecurityHeaders>();
app.UseRateLimiter();
app.MapDefaultEndpoints();
app.MapReverseProxy();
app.Run();

// Per client address, fixed window. The address is the forwarded client IP when
// the request came through a trusted proxy (UseForwardedHeaders above).
static RateLimitPartition<string> PerClientWindow(HttpContext ctx, string section, int defaultLimit, string? bucket = null)
{
    var limits = ctx.RequestServices.GetRequiredService<IConfiguration>().GetSection(section);
    return RateLimitPartition.GetFixedWindowLimiter(
        $"{section}:{bucket ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limits.GetValue("PermitLimit", defaultLimit),
            Window = TimeSpan.FromSeconds(limits.GetValue("WindowSeconds", 60)),
            QueueLimit = 0,
        });
}

// A signed-in user's own bucket: the device key their token is bound to
// (cnf.jkt), so thousands of phones behind one carrier address don't share a
// limit. Read without validating: it only picks a bucket, the services check
// the token, and the global per-address limit caps anyone who forges keys to
// get more buckets.
static string? UserBucket(HttpContext ctx)
{
    var header = ctx.Request.Headers.Authorization.ToString();
    if (!header.StartsWith("DPoP ", StringComparison.Ordinal) || header.Length > 8192) return null;
    try
    {
        var token = new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(header["DPoP ".Length..].Trim());
        return token.TryGetPayloadValue<System.Text.Json.JsonElement>("cnf", out var cnf) &&
               cnf.ValueKind == System.Text.Json.JsonValueKind.Object &&
               cnf.TryGetProperty("jkt", out var jkt) && jkt.GetString() is { Length: > 0 and <= 64 } key
            ? $"jkt:{key}"
            : null;
    }
    catch (ArgumentException)
    {
        return null;
    }
}

/// <summary>Exposed for WebApplicationFactory in the gateway tests.</summary>
public partial class Program;
