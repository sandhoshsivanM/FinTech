// Local orchestration for the whole backend:
//   dotnet run --project backend/Khazana.AppHost
// Starts Postgres and RabbitMQ in Docker, then every service, wires their
// connection strings and service-discovery names, and opens the Aspire
// dashboard (logs, traces, metrics for all of them in one place).

var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres").WithDataVolume("khazana-postgres");
var marketDb = postgres.AddDatabase("marketdata");
var identityDb = postgres.AddDatabase("identity");
var devicesDb = postgres.AddDatabase("devices");
var syncDb = postgres.AddDatabase("sync");
var notificationDb = postgres.AddDatabase("notification");
var reportingDb = postgres.AddDatabase("reporting");

var rabbitMq = builder.AddRabbitMQ("rabbitmq").WithManagementPlugin();

// Local runs read the fixture instead of downloading from AMFI (decision D15,
// free first): nothing leaves the laptop unless you switch Providers__Nav to Amfi.
var fixture = Path.GetFullPath(Path.Combine(builder.AppHostDirectory,
    "..", "..", "contracts", "fixtures", "amfi", "navall_sample.txt"));

var marketData = builder.AddProject<Projects.Khazana_MarketData_Api>("marketdata-api")
    .WithReference(marketDb).WaitFor(marketDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WithEnvironment("Providers__Nav", "Fixture")
    .WithEnvironment("Providers__NavFixturePath", fixture);

// The key for Identity's encrypted fields: generated once, kept in this
// machine's user secrets, never in the repo. The cloud reads it from AWS
// Secrets Manager instead.
var fieldKey = builder.AddParameter("identity-field-key",
    new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);

var identity = builder.AddProject<Projects.Khazana_Identity_Api>("identity-api")
    .WithReference(identityDb).WaitFor(identityDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WithEnvironment("Identity__Secrets__FieldKey", fieldKey);

// Every other service checks tokens itself, with Identity's public keys.
var identityMetadata = ReferenceExpression.Create(
    $"{identity.GetEndpoint("http")}/.well-known/openid-configuration");

var devices = builder.AddProject<Projects.Khazana_Devices_Api>("devices-api")
    .WithReference(devicesDb).WaitFor(devicesDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WaitFor(identity)
    .WithEnvironment("Auth__MetadataAddress", identityMetadata);

var sync = builder.AddProject<Projects.Khazana_Sync_Api>("sync-api")
    .WithReference(syncDb).WaitFor(syncDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WaitFor(identity)
    .WithEnvironment("Auth__MetadataAddress", identityMetadata);

// Pushes are logged, not sent, until FCM and APNs keys exist (decision D15).
var notification = builder.AddProject<Projects.Khazana_Notification_Api>("notification-api")
    .WithReference(notificationDb).WaitFor(notificationDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WaitFor(identity)
    .WithEnvironment("Auth__MetadataAddress", identityMetadata)
    .WithEnvironment("Providers__Push", "Log");

// Audit & Reporting and the admin panel: internal only, never behind the public
// gateway. They share a generated service key (client credentials + mTLS later).
var reportingKey = builder.AddParameter("reporting-internal-key",
    new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);

var reporting = builder.AddProject<Projects.Khazana_AuditReporting_Api>("reporting-api")
    .WithReference(reportingDb).WaitFor(reportingDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WithEnvironment("Reporting__InternalKey", reportingKey);

builder.AddProject<Projects.Khazana_Admin>("admin")
    .WithReference(reporting).WaitFor(reporting)
    .WithEnvironment("Admin__ReportingKey", reportingKey);

var gateway = builder.AddProject<Projects.Khazana_Gateway>("gateway")
    .WithReference(marketData).WaitFor(marketData)
    .WithReference(identity).WaitFor(identity)
    .WithReference(devices).WaitFor(devices)
    .WithReference(sync).WaitFor(sync)
    .WithReference(notification).WaitFor(notification)
    .WithExternalHttpEndpoints();

// DPoP proofs name the URL the app called, which is the gateway's.
foreach (var service in new[] { identity, devices, sync, notification })
    service.WithEnvironment("Auth__PublicOrigins__0", gateway.GetEndpoint("http"));

builder.Build().Run();
