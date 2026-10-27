using System.Reflection;
using NetArchTest.Rules;
using Shouldly;

namespace Khazana.ArchitectureTests;

/// <summary>
/// The architecture, as tests. A rule that lives only in a document is broken
/// the first time someone is in a hurry; one that fails the build is not.
/// </summary>
public class BoundaryTests
{
    private static readonly Assembly Messaging = typeof(Khazana.Messaging.KhazanaMessaging).Assembly;

    /// <summary>Each service's four layers. A new service adds one line here and gets every rule.</summary>
    private static readonly ServiceLayers[] Services =
    [
        new("MarketData",
            typeof(Khazana.MarketData.Domain.NavQuote).Assembly,
            typeof(Khazana.MarketData.Application.INavSource).Assembly,
            typeof(Khazana.MarketData.Infrastructure.AmfiNavSource).Assembly,
            typeof(Khazana.MarketData.Api.NavEndpoints).Assembly),
        new("Identity",
            typeof(Khazana.Identity.Domain.RefreshTokenRules).Assembly,
            typeof(Khazana.Identity.Application.SessionService).Assembly,
            typeof(Khazana.Identity.Infrastructure.AesGcmFieldProtector).Assembly,
            typeof(Khazana.Identity.Api.IdentityEndpoints).Assembly),
        new("Devices",
            typeof(Khazana.Devices.Domain.KeyRules).Assembly,
            typeof(Khazana.Devices.Application.DeviceKeyService).Assembly,
            typeof(Khazana.Devices.Infrastructure.DependencyInjection).Assembly,
            typeof(Khazana.Devices.Api.DeviceEndpoints).Assembly),
        new("Sync",
            typeof(Khazana.Sync.Domain.SyncRules).Assembly,
            typeof(Khazana.Sync.Application.SyncService).Assembly,
            typeof(Khazana.Sync.Infrastructure.DependencyInjection).Assembly,
            typeof(Khazana.Sync.Api.SyncEndpoints).Assembly),
        new("Notification",
            typeof(Khazana.Notification.Domain.PushContent).Assembly,
            typeof(Khazana.Notification.Application.PushDispatcher).Assembly,
            typeof(Khazana.Notification.Infrastructure.FcmPushSender).Assembly,
            typeof(Khazana.Notification.Api.PushEndpoints).Assembly),
        new("AuditReporting",
            typeof(Khazana.AuditReporting.Domain.AuditChain).Assembly,
            typeof(Khazana.AuditReporting.Application.AdminQueries).Assembly,
            typeof(Khazana.AuditReporting.Infrastructure.DependencyInjection).Assembly,
            typeof(Khazana.AuditReporting.Api.AdminEndpoints).Assembly),
        new("Catalog",
            typeof(Khazana.Catalog.Domain.CatalogRules).Assembly,
            typeof(Khazana.Catalog.Application.CurationService).Assembly,
            typeof(Khazana.Catalog.Infrastructure.Ed25519CatalogSigner).Assembly,
            typeof(Khazana.Catalog.Api.CatalogEndpoints).Assembly),
        new("AccountAggregator",
            typeof(Khazana.AccountAggregator.Domain.ConsentRules).Assembly,
            typeof(Khazana.AccountAggregator.Application.ConsentService).Assembly,
            typeof(Khazana.AccountAggregator.Infrastructure.FakeBankDataProvider).Assembly,
            typeof(Khazana.AccountAggregator.Api.AaEndpoints).Assembly),
        new("Credit",
            typeof(Khazana.Credit.Domain.CreditRules).Assembly,
            typeof(Khazana.Credit.Application.CreditService).Assembly,
            typeof(Khazana.Credit.Infrastructure.FakeCreditReportProvider).Assembly,
            typeof(Khazana.Credit.Api.CreditEndpoints).Assembly),
    ];

    private static readonly string[] AllServiceNamespaces =
    [
        "Khazana.Gateway", "Khazana.Identity", "Khazana.MarketData", "Khazana.Sync", "Khazana.Devices",
        "Khazana.AccountAggregator", "Khazana.Credit", "Khazana.Catalog", "Khazana.Notification", "Khazana.AuditReporting",
    ];

    public static TheoryData<string> ServiceNames => [.. Services.Select(s => s.Name)];

    private static ServiceLayers Service(string name) => Services.Single(s => s.Name == name);

    [Theory]
    [MemberData(nameof(ServiceNames))]
    public void Domain_depends_on_no_framework(string service)
    {
        var s = Service(service);
        Assert(Types.InAssembly(s.Domain).ShouldNot().HaveDependencyOnAny(
            "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Wolverine", "Npgsql",
            "System.Net.Http", $"Khazana.{service}.Application", $"Khazana.{service}.Infrastructure"));
    }

    [Theory]
    [MemberData(nameof(ServiceNames))]
    public void Application_does_not_know_about_the_web_or_the_adapters(string service)
    {
        var s = Service(service);
        Assert(Types.InAssembly(s.Application).ShouldNot().HaveDependencyOnAny(
            "Microsoft.AspNetCore", $"Khazana.{service}.Infrastructure", $"Khazana.{service}.Api"));
    }

    [Theory]
    [MemberData(nameof(ServiceNames))]
    public void Infrastructure_does_not_depend_on_the_api(string service)
    {
        Assert(Types.InAssembly(Service(service).Infrastructure).ShouldNot().HaveDependencyOn($"Khazana.{service}.Api"));
    }

    [Theory]
    [MemberData(nameof(ServiceNames))]
    public void A_service_never_references_another_service_or_the_gateway(string service)
    {
        // Services talk through events and APIs, never each other's code.
        var others = AllServiceNamespaces.Where(n => n != $"Khazana.{service}").ToArray();
        foreach (var assembly in Service(service).All)
            Assert(Types.InAssembly(assembly).ShouldNot().HaveDependencyOnAny(others));
    }

    [Fact]
    public void The_admin_panel_depends_on_no_service_and_no_database()
    {
        // It may only speak HTTP to Audit & Reporting (design doc §8.10).
        Assert(Types.InAssembly(typeof(Khazana.Admin.ReportingClient).Assembly).ShouldNot().HaveDependencyOnAny(
            [.. AllServiceNamespaces, "Khazana.Messaging", "Microsoft.EntityFrameworkCore", "Npgsql", "Wolverine"]));
    }

    [Fact]
    public void The_security_building_block_knows_no_service()
    {
        Assert(Types.InAssembly(typeof(Khazana.Security.KhazanaAuthentication).Assembly).ShouldNot().HaveDependencyOnAny(
            [.. Services.Select(s => $"Khazana.{s.Name}")]));
    }

    [Fact]
    public void Event_contracts_are_versioned_sealed_records()
    {
        var contracts = Types.InAssembly(Messaging).That().ResideInNamespace("Khazana.Messaging.Contracts").GetTypes().ToList();
        contracts.ShouldNotBeEmpty();
        foreach (var type in contracts)
        {
            type.IsSealed.ShouldBeTrue($"{type.Name} must be sealed");
            type.GetMethod("<Clone>$").ShouldNotBeNull($"{type.Name} must be a record (immutable)");
            System.Text.RegularExpressions.Regex.IsMatch(type.Name, @"V\d+$")
                .ShouldBeTrue($"{type.Name} must end with its version, e.g. V1");
        }
    }

    [Fact]
    public void Only_shared_contracts_are_routed_over_the_broker()
    {
        Khazana.Messaging.KhazanaMessaging.IsContract(typeof(Khazana.Messaging.Contracts.PricesPublishedV1)).ShouldBeTrue();
        Khazana.Messaging.KhazanaMessaging.IsContract(typeof(Khazana.MarketData.Application.Ingest.IngestNav))
            .ShouldBeFalse("a service's internal command must stay on its local queue");
    }

    private static void Assert(ConditionList rule)
    {
        var result = rule.GetResult();
        result.IsSuccessful.ShouldBeTrue(
            "Boundary broken by: " + string.Join(", ", result.FailingTypeNames ?? []));
    }
}

internal sealed record ServiceLayers(string Name, Assembly Domain, Assembly Application, Assembly Infrastructure, Assembly Api)
{
    public Assembly[] All => [Domain, Application, Infrastructure, Api];
}
