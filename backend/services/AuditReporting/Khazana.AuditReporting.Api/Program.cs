using Khazana.AuditReporting.Api;
using Khazana.AuditReporting.Application;
using Khazana.AuditReporting.Application.Persistence;
using Khazana.AuditReporting.Infrastructure;
using Khazana.Messaging;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 8 * 1024);

var database = builder.Configuration.GetConnectionString("reporting")
    ?? throw new InvalidOperationException("ConnectionStrings:reporting is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton(new InternalKey(builder.Configuration["Reporting:InternalKey"]));
builder.Services.AddReportingInfrastructure();
builder.Services.AddDbContextWithWolverineIntegration<ReportingDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<AuditWriter>();
builder.Services.AddScoped<AdminQueries>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<SigninRetentionSweeper>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("reporting", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(ProjectionHandler).Assembly);
});

var app = builder.Build();
app.MapDefaultEndpoints();
app.MapAdminEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
