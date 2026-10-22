using System.Threading.RateLimiting;
using Khazana.Gateway;
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
    o.AddPolicy(GatewayPolicies.User, ctx => PerClientWindow(ctx, "RateLimits:User", 120));
});

var app = builder.Build();

if (trustedProxies.Length > 0) app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseMiddleware<SecurityHeaders>();
app.UseRateLimiter();
app.MapDefaultEndpoints();
app.MapReverseProxy();
app.Run();

// Per client address, fixed window. The address is the forwarded client IP when
// the request came through a trusted proxy (UseForwardedHeaders above).
static RateLimitPartition<string> PerClientWindow(HttpContext ctx, string section, int defaultLimit)
{
    var limits = ctx.RequestServices.GetRequiredService<IConfiguration>().GetSection(section);
    return RateLimitPartition.GetFixedWindowLimiter(
        $"{section}:{ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown"}",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limits.GetValue("PermitLimit", defaultLimit),
            Window = TimeSpan.FromSeconds(limits.GetValue("WindowSeconds", 60)),
            QueueLimit = 0,
        });
}

/// <summary>Exposed for WebApplicationFactory in the gateway tests.</summary>
public partial class Program;
