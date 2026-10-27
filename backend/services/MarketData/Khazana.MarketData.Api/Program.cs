using Khazana.MarketData.Api;
using Khazana.MarketData.Application.Ingest;
using Khazana.MarketData.Application.Persistence;
using Khazana.MarketData.Infrastructure;
using Khazana.Messaging;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddOpenApi();

// Connection strings are injected by Aspire locally and by the platform in the
// cloud. Missing means misconfigured: fail now, not on the first request.
var database = builder.Configuration.GetConnectionString("marketdata")
    ?? throw new InvalidOperationException("ConnectionStrings:marketdata is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddNavSource(builder.Configuration, builder.Environment);
builder.Services.AddDbContextWithWolverineIntegration<MarketDataDbContext>(o => o.UseNpgsql(database));
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<NavIngestScheduler>();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("marketdata", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(IngestNavHandler).Assembly);
});

var app = builder.Build();
app.MapDefaultEndpoints();
app.MapNavEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
