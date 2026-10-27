using Khazana.Credit.Api;
using Khazana.Credit.Application;
using Khazana.Credit.Application.Persistence;
using Khazana.Credit.Infrastructure;
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

var database = builder.Configuration.GetConnectionString("credit")
    ?? throw new InvalidOperationException("ConnectionStrings:credit is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
// The bureau adapter, refused in Production when it is the sample one (ADR 0003).
builder.Services.AddCreditInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddSingleton(new CreditSettings(
    builder.Configuration.GetSection("Credit:ConsentTextVersions").Get<string[]>() ?? [CreditSettings.DefaultVersion]));
builder.Services.AddKhazanaAuthentication(builder.Configuration, replayDatabase: database);
builder.Services.AddDeletionCancellations(database);
builder.Services.AddDbContextWithWolverineIntegration<CreditDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<CreditService>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<MaintenanceSweeper>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging(AccountDeletionHandler.ServiceName, rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(CreditService).Assembly);
    opts.ListenForDeletionCancellations();
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapCreditEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
