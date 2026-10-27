using Khazana.Messaging;
using Khazana.Notification.Api;
using Khazana.Notification.Application;
using Khazana.Notification.Application.Persistence;
using Khazana.Notification.Infrastructure;
using Khazana.Security;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 16 * 1024);

var database = builder.Configuration.GetConnectionString("notification")
    ?? throw new InvalidOperationException("ConnectionStrings:notification is not set.");
var rabbitMq = builder.Configuration.GetConnectionString("rabbitmq")
    ?? throw new InvalidOperationException("ConnectionStrings:rabbitmq is not set.");

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddNotificationInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddKhazanaAuthentication(builder.Configuration, replayDatabase: database);
builder.Services.AddDeletionCancellations(database);
builder.Services.AddDbContextWithWolverineIntegration<NotificationDbContext>(o => o.UseNpgsql(database));
builder.Services.AddScoped<PushDispatcher>();
builder.Services.AddScoped<PushRegistrationService>();
builder.Services.AddHostedService<DatabaseMigrator>();
builder.Services.AddKhazanaJson();

builder.Host.UseWolverine(opts =>
{
    opts.UseKhazanaMessaging("notification", rabbitMq, database);
    opts.UseEntityFrameworkCoreTransactions();
    opts.Discovery.IncludeAssembly(typeof(PushDispatcher).Assembly);
    opts.ListenForDeletionCancellations();
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapPushEndpoints();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the integration tests.</summary>
public partial class Program;
