using Khazana.Devices.Api;
using Khazana.Devices.Application;
using Khazana.Devices.Application.Persistence;
using Khazana.Devices.Infrastructure;
using Khazana.Messaging;
using Khazana.Security;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 16 * 1024);

var database = builder.Configuration.GetConnectionString("devices")
    ?? throw new InvalidOperationException("ConnectionStrings:devices is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddDevicesInfrastructure();
// Tokens are checked here with Identity's public keys (Auth:MetadataAddress).
builder.Services.AddKhazanaAuthentication(builder.Configuration, replayDatabase: database);
builder.Services.AddDeletionCancellations(database);
builder.Services.AddDbContextWithWolverineIntegration<DevicesDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<DeviceKeyService>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("devices", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(AccountDeletionHandler).Assembly);
    opts.ListenForDeletionCancellations();
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapDeviceEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
