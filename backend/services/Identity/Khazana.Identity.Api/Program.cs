using Khazana.Identity.Api;
using Khazana.Identity.Application;
using Khazana.Identity.Application.Persistence;
using Khazana.Identity.Infrastructure;
using Khazana.Messaging;
using Khazana.Security;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

// Sign-in bodies are small; a passkey attestation is ~2 KB.
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024);

var database = builder.Configuration.GetConnectionString("identity")
    ?? throw new InvalidOperationException("ConnectionStrings:identity is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

var auth = builder.Configuration.GetSection(KhazanaAuthOptions.Section).Get<KhazanaAuthOptions>() ?? new();
builder.Services.AddSingleton(new TokenSettings(auth.Issuer, auth.Audience));
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddIdentityInfrastructure(builder.Configuration, builder.Environment);

// Identity checks its own tokens with its own keys (no HTTP to itself).
builder.Services.AddSingleton<IConfigurationManager<OpenIdConnectConfiguration>, LocalKeysConfigurationManager>();
builder.Services.AddKhazanaAuthentication(builder.Configuration);

builder.Services.AddDbContextWithWolverineIntegration<IdentityDbContext>(o => o.UseNpgsql(database));
builder.Services.AddSingleton<TokenIssuer>();
builder.Services.AddScoped<SessionService>();
builder.Services.AddScoped<PasskeyService>();
builder.Services.AddHostedService<DatabaseMigrator>();

builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("identity", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(SessionService).Assembly);
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapIdentityEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
