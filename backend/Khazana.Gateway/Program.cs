using System.Threading.RateLimiting;
using Khazana.Gateway;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

// GET-only API today; a body has no business arriving here.
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    // Cluster addresses like "http://marketdata-api" are resolved by name
    // (Aspire locally, the platform in the cloud), never hard-coded.
    .AddServiceDiscoveryDestinationResolver();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // "public": per client address, fixed window. Partitioned by the
    // connection's remote IP; behind a load balancer this must switch to the
    // forwarded client IP (ForwardedHeaders), or every user shares one bucket.
    o.AddPolicy(GatewayPolicies.Public, ctx =>
    {
        var limits = ctx.RequestServices.GetRequiredService<IConfiguration>().GetSection("RateLimits:Public");
        return RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = limits.GetValue("PermitLimit", 60),
                Window = TimeSpan.FromSeconds(limits.GetValue("WindowSeconds", 60)),
                QueueLimit = 0,
            });
    });
});

var app = builder.Build();

if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseMiddleware<SecurityHeaders>();
app.UseRateLimiter();
app.MapDefaultEndpoints();
app.MapReverseProxy();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the gateway tests.</summary>
public partial class Program;
