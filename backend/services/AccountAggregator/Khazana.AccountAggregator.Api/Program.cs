using Khazana.AccountAggregator.Api;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Infrastructure;
using Khazana.Messaging;
using Khazana.Security;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.ErrorHandling;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = AaEndpoints.MaxCallbackBytes);

var database = builder.Configuration.GetConnectionString("aa")
    ?? throw new InvalidOperationException("ConnectionStrings:aa is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
// The bank-data adapter, refused in Production when it is the sample one (ADR 0003).
builder.Services.AddAccountAggregatorInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddKhazanaAuthentication(builder.Configuration, replayDatabase: database);
builder.Services.AddDeletionCancellations(database);
builder.Services.AddDbContextWithWolverineIntegration<AaDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<ConsentService>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddHostedService<MaintenanceSweeper>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging(AccountDeletionHandler.ServiceName, rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(ConsentService).Assembly);
    opts.ListenForDeletionCancellations();
    // A partner that is down when told of a revocation hears about it later:
    // retried with backoff, then dead-lettered for a person to look at.
    opts.OnException<BankDataProviderException>()
        .ScheduleRetry(TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30), TimeSpan.FromHours(2));
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapAaEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
