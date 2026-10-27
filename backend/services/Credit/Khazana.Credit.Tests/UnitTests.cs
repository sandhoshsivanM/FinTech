using Khazana.Credit.Application;
using Khazana.Credit.Domain;
using Khazana.Credit.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Shouldly;

namespace Khazana.Credit.Tests;

public class CreditRulesTests
{
    [Theory]
    [InlineData("ABCPE1234F", true)]
    [InlineData("AAACB1234C", true)]
    [InlineData("ABCXE1234F", false)] // X is not a holder type
    [InlineData("abcpe1234f", false)]
    [InlineData("ABCPE12345", false)]
    [InlineData("ABCPE1234", false)]
    [InlineData(null, false)]
    public void PANs_follow_the_income_tax_format(string? pan, bool valid) => CreditRules.IsValidPan(pan).ShouldBe(valid);

    [Theory]
    [InlineData("9876543210", true)]
    [InlineData("6000000000", true)]
    [InlineData("5876543210", false)]
    [InlineData("+919876543210", false)]
    [InlineData("98765 43210", false)]
    public void Mobiles_are_ten_indian_digits(string mobile, bool valid) => CreditRules.IsValidMobile(mobile).ShouldBe(valid);

    [Fact]
    public void One_pull_per_30_days()
    {
        var at = DateTimeOffset.UtcNow;
        CreditRules.NextAllowedAt(null).ShouldBeNull();
        CreditRules.NextAllowedAt(at).ShouldBe(at.AddDays(30));
    }

    [Fact]
    public void Requests_never_print_the_PAN_or_mobile()
    {
        var request = new CreditReportRequest(Guid.CreateVersion7(), "ABCPE1234F", "9876543210", "Asha Rao", "v1", CreditRules.Purpose, DateTimeOffset.UtcNow);
        request.ToString().ShouldNotContain("ABCPE1234F");
        request.ToString().ShouldNotContain("9876543210");
        var body = new PullRequest("v1", true, "ABCPE1234F", "9876543210", new byte[32]);
        body.ToString().ShouldNotContain("ABCPE1234F");
        body.ToString().ShouldNotContain("9876543210");
    }
}

public class FakeCreditProviderTests
{
    private static Task<CreditReport> Pull(string pan) => new FakeCreditReportProvider().FetchReportAsync(
        new CreditReportRequest(Guid.CreateVersion7(), pan, "9876543210", null, "v1", CreditRules.Purpose, DateTimeOffset.UtcNow),
        TestContext.Current.CancellationToken);

    [Fact]
    public async Task The_same_PAN_gets_the_same_report_and_another_PAN_another()
    {
        var a = await Pull("ABCPE1234F");
        var b = await Pull("ABCPE1234F");
        a.Score.ShouldBe(b.Score with { Factors = a.Score.Factors });
        a.Score.Factors.ShouldBe(b.Score.Factors);
        a.Accounts.Select(x => x.MaskedNumber).ShouldBe(b.Accounts.Select(x => x.MaskedNumber));

        var reports = await Task.WhenAll(Enumerable.Range(0, 10).Select(i => Pull($"ABCPE{1000 + i}F")));
        reports.Select(r => r.Score.Value).Distinct().Count().ShouldBeGreaterThan(1);
    }

    [Fact]
    public async Task A_sample_report_is_realistic_and_labelled()
    {
        var report = await Pull("AAAPZ9999K");
        report.Sample.ShouldBeTrue();
        report.Score.Value.ShouldBeInRange(300, 900);
        report.Accounts.ShouldContain(a => a.AccountType == "CREDIT_CARD" && a.CreditLimit != null);
        report.Accounts.ShouldContain(a => a.Status == "CLOSED");
        report.Accounts.ShouldAllBe(a => a.MaskedNumber.StartsWith("XXXX", StringComparison.Ordinal));
        report.Accounts.ShouldAllBe(a => a.PaymentHistory.Count == 12);
        report.Summary.TotalAccounts.ShouldBe(report.Accounts.Count);
        decimal.Parse(report.Summary.Utilisation, System.Globalization.CultureInfo.InvariantCulture).ShouldBeInRange(0m, 100m);
        System.Text.Json.JsonSerializer.Serialize(report).ShouldNotContain("AAAPZ9999K", Case.Insensitive, "the PAN is never in the report");
    }

    [Fact]
    public async Task A_PAN_ending_in_Z_has_no_record()
    {
        (await Should.ThrowAsync<CreditProviderException>(() => Pull("ABCPE1234Z"))).Code.ShouldBe("no_record");
    }
}

public class CreditProviderGuardTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "credit";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IServiceCollection Register(string environment, string? provider) =>
        new ServiceCollection().AddCreditInfrastructure(
            new ConfigurationBuilder().AddInMemoryCollection([new("Providers:Credit", provider)]).Build(), new Env(environment));

    [Fact]
    public void The_sample_report_is_refused_in_Production()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production, "Fake")).Message.ShouldContain("not allowed in Production");
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production, null));
    }

    [Fact]
    public void Unknown_providers_stop_startup() =>
        Should.Throw<InvalidOperationException>(() => Register(Environments.Development, "Cibil"));

    [Fact]
    public void Development_and_staging_run_the_sample()
    {
        Register(Environments.Development, "Fake").ShouldContain(d => d.ImplementationType == typeof(FakeCreditReportProvider));
        Register(Environments.Staging, "Fake").ShouldContain(d => d.ImplementationType == typeof(FakeCreditReportProvider));
    }
}
