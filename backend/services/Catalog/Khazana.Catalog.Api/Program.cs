using Khazana.Catalog.Api;
using Khazana.Catalog.Application;
using Khazana.Catalog.Application.Persistence;
using Khazana.Catalog.Infrastructure;
using Khazana.Messaging;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024);

var database = builder.Configuration.GetConnectionString("catalog")
    ?? throw new InvalidOperationException("ConnectionStrings:catalog is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");
if ((builder.Configuration["Catalog:InternalKey"] ?? string.Empty).Length < 32)
    throw new InvalidOperationException("Catalog:InternalKey must be at least 32 characters.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddCatalogInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddDbContextWithWolverineIntegration<CatalogDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<CurationService>();
builder.Services.AddScoped<CatalogQueries>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<RepublishSweeper>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("catalog", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(PublishCatalogHandler).Assembly);
});

var app = builder.Build();
app.MapDefaultEndpoints();
app.MapCatalogEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
