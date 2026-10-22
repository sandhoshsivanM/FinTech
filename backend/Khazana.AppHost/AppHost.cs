// Local orchestration for the whole backend:
//   dotnet run --project backend/Khazana.AppHost
// Starts Postgres and RabbitMQ in Docker, then every service, wires their
// connection strings and service-discovery names, and opens the Aspire
// dashboard (logs, traces, metrics for all of them in one place).

var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres").WithDataVolume("khazana-postgres");
var marketDb = postgres.AddDatabase("marketdata");
var identityDb = postgres.AddDatabase("identity");

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

var gateway = builder.AddProject<Projects.Khazana_Gateway>("gateway")
    .WithReference(marketData).WaitFor(marketData)
    .WithReference(identity).WaitFor(identity)
    .WithExternalHttpEndpoints();

// DPoP proofs name the URL the app called, which is the gateway's.
identity.WithEnvironment("Auth__PublicOrigins__0", gateway.GetEndpoint("http"));

builder.Build().Run();
