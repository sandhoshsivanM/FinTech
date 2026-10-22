using System.Threading.RateLimiting;
using Khazana.Gateway;

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

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(GatewayPolicies.Public, ctx => PerClientWindow(ctx, "RateLimits:Public", 60));
    o.AddPolicy(GatewayPolicies.Auth, ctx => PerClientWindow(ctx, "RateLimits:Auth", 20));
    o.AddPolicy(GatewayPolicies.User, ctx => PerClientWindow(ctx, "RateLimits:User", 120));
});

var app = builder.Build();

if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseMiddleware<SecurityHeaders>();
app.UseRateLimiter();
app.MapDefaultEndpoints();
app.MapReverseProxy();
app.Run();

// Per client address, fixed window. Partitioned by the connection's remote IP;
// behind a load balancer this must switch to the forwarded client IP
// (ForwardedHeaders), or every user shares one bucket.
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
