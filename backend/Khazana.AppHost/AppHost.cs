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
var catalogDb = postgres.AddDatabase("catalog");

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
    .WithEnvironment("Identity__Secrets__FieldKey", fieldKey)
    // Passkeys made by Khazana Online's web app in development (webapp-online/: npm run dev).
    .WithEnvironment("Identity__Passkeys__RpId", "localhost")
    .WithEnvironment("Identity__Passkeys__Origins__0", "http://localhost:3100");

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

// The audit chain's MAC key: never in the database it protects.
var auditKey = builder.AddParameter("reporting-audit-key",
    new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);

var reporting = builder.AddProject<Projects.Khazana_AuditReporting_Api>("reporting-api")
    .WithReference(reportingDb).WaitFor(reportingDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WithEnvironment("Reporting__InternalKey", reportingKey)
    .WithEnvironment("Reporting__AuditKey", auditKey);

var admin = builder.AddProject<Projects.Khazana_Admin>("admin")
    .WithReference(reporting).WaitFor(reporting)
    .WithEnvironment("Admin__ReportingKey", reportingKey);

// Public, signed data. Locally the signing key is a throwaway (Development only).
var catalogKey = builder.AddParameter("catalog-internal-key",
    new GenerateParameterDefault { MinLength = 48, Special = false }, secret: true, persist: true);
var catalog = builder.AddProject<Projects.Khazana_Catalog_Api>("catalog-api")
    .WithReference(catalogDb).WaitFor(catalogDb)
    .WithReference(rabbitMq).WaitFor(rabbitMq)
    .WithEnvironment("Catalog__InternalKey", catalogKey);

// The admin's offer editors use Catalog's internal API with its own key.
admin.WithReference(catalog).WaitFor(catalog).WithEnvironment("Admin__CatalogKey", catalogKey);

var gateway = builder.AddProject<Projects.Khazana_Gateway>("gateway")
    .WithReference(marketData).WaitFor(marketData)
    .WithReference(identity).WaitFor(identity)
    .WithReference(devices).WaitFor(devices)
    .WithReference(sync).WaitFor(sync)
    .WithReference(notification).WaitFor(notification)
    .WithReference(catalog).WaitFor(catalog)
    .WithExternalHttpEndpoints()
    // Khazana Online's web app in development (webapp-online/: npm run dev).
    .WithEnvironment("Gateway__AllowedOrigins__0", "http://localhost:3100");

// DPoP proofs name the URL the app called, which is the gateway's.
// The Android emulator reaches this machine's gateway as 10.0.2.2, so a phone
// app in development names that address (local development only).
foreach (var service in new[] { identity, devices, sync, notification })
    service.WithEnvironment("Auth__PublicOrigins__0", gateway.GetEndpoint("http"))
        .WithEnvironment("Auth__PublicOrigins__1", "http://10.0.2.2:5196");

builder.Build().Run();
