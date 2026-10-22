using Khazana.Messaging;
using Khazana.Security;
using Khazana.SharedKernel;
using Khazana.Sync.Api;
using Khazana.Sync.Application;
using Khazana.Sync.Application.Persistence;
using Khazana.Sync.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
// The push endpoint raises its own limit to SyncRules.MaxPushBodyBytes; everything else stays small.
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024);

var database = builder.Configuration.GetConnectionString("sync")
    ?? throw new InvalidOperationException("ConnectionStrings:sync is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSyncInfrastructure();
builder.Services.AddKhazanaAuthentication(builder.Configuration);
builder.Services.AddDbContextWithWolverineIntegration<SyncDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<SyncService>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<TombstoneSweeper>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("sync", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(PushRecordsHandler).Assembly);
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapSyncEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
