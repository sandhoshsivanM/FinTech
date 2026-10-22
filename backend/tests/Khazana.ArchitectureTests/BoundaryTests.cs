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
    private static readonly Assembly Domain = typeof(Khazana.MarketData.Domain.NavQuote).Assembly;
    private static readonly Assembly Application = typeof(Khazana.MarketData.Application.INavSource).Assembly;
    private static readonly Assembly Infrastructure = typeof(Khazana.MarketData.Infrastructure.AmfiNavSource).Assembly;
    private static readonly Assembly Api = typeof(Khazana.MarketData.Api.NavEndpoints).Assembly;
    private static readonly Assembly Messaging = typeof(Khazana.Messaging.KhazanaMessaging).Assembly;

    [Fact]
    public void Domain_depends_on_no_framework()
    {
        Assert(Types.InAssembly(Domain).ShouldNot().HaveDependencyOnAny(
            "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Wolverine", "Npgsql",
            "System.Net.Http", "Khazana.MarketData.Application", "Khazana.MarketData.Infrastructure"));
    }

    [Fact]
    public void Application_does_not_know_about_the_web_or_the_adapters()
    {
        Assert(Types.InAssembly(Application).ShouldNot().HaveDependencyOnAny(
            "Microsoft.AspNetCore", "Khazana.MarketData.Infrastructure", "Khazana.MarketData.Api"));
    }

    [Fact]
    public void Infrastructure_does_not_depend_on_the_api()
    {
        Assert(Types.InAssembly(Infrastructure).ShouldNot().HaveDependencyOn("Khazana.MarketData.Api"));
    }

    [Fact]
    public void A_service_never_references_another_service_or_the_gateway()
    {
        // Services talk through events and APIs, never each other's code.
        foreach (var assembly in new[] { Domain, Application, Infrastructure, Api })
        {
            Assert(Types.InAssembly(assembly).ShouldNot().HaveDependencyOnAny(
                "Khazana.Gateway", "Khazana.Identity", "Khazana.Sync", "Khazana.Devices",
                "Khazana.AccountAggregator", "Khazana.Credit", "Khazana.Catalog",
                "Khazana.Notification", "Khazana.AuditReporting"));
        }
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
