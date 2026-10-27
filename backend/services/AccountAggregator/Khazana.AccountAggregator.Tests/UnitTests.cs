using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;
using Khazana.AccountAggregator.Infrastructure;
using Khazana.Crypto;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Shouldly;

namespace Khazana.AccountAggregator.Tests;

public class ConsentRulesTests
{
    [Fact]
    public void FI_types_are_normalised_and_unknown_or_duplicate_ones_refused()
    {
        ConsentRules.CleanFiTypes(["deposit", " MUTUAL_FUNDS "]).ShouldBe(["DEPOSIT", "MUTUAL_FUNDS"]);
        ConsentRules.CleanFiTypes(["DEPOSIT", "deposit"]).ShouldBeNull("duplicates");
        ConsentRules.CleanFiTypes(["CRYPTO"]).ShouldBeNull("unknown");
        ConsentRules.CleanFiTypes([]).ShouldBeNull("empty");
        ConsentRules.CleanFiTypes(null).ShouldBeNull();
    }

    [Theory]
    [InlineData(null, true, FetchFrequency.Weekly)]
    [InlineData("daily", true, FetchFrequency.Daily)]
    [InlineData("MONTHLY", true, FetchFrequency.Monthly)]
    [InlineData("1", false, FetchFrequency.Weekly)]
    [InlineData("hourly", false, FetchFrequency.Weekly)]
    [InlineData("", false, FetchFrequency.Weekly)]
    public void Frequencies_are_names_only(string? wire, bool ok, FetchFrequency expected)
    {
        ConsentRules.TryParseFrequency(wire, out var parsed).ShouldBe(ok);
        if (ok) parsed.ShouldBe(expected);
    }

    [Fact]
    public void Ranges_stay_inside_the_history_limit_and_never_reach_the_future()
    {
        var today = new DateOnly(2026, 10, 27);
        ConsentRules.IsValidRange(today.AddDays(-180), today, today).ShouldBeTrue();
        ConsentRules.IsValidRange(today, today.AddDays(1), today).ShouldBeFalse();
        ConsentRules.IsValidRange(today.AddDays(-1), today.AddDays(-2), today).ShouldBeFalse();
        ConsentRules.IsValidRange(today.AddDays(-ConsentRules.MaxHistoryDays - 1), today, today).ShouldBeFalse();
    }

    [Theory]
    [InlineData(ConsentStatus.Active, 1, true)]
    [InlineData(ConsentStatus.Active, -1, false)]
    [InlineData(ConsentStatus.Pending, 1, false)]
    [InlineData(ConsentStatus.Paused, 1, false)]
    [InlineData(ConsentStatus.Revoked, 1, false)]
    [InlineData(ConsentStatus.Expired, 1, false)]
    [InlineData(ConsentStatus.Rejected, 1, false)]
    public void Only_an_active_unexpired_consent_allows_a_fetch(ConsentStatus status, int expiresInDays, bool allowed)
    {
        var now = DateTimeOffset.UtcNow;
        ConsentRules.AllowsFetch(status, now.AddDays(expiresInDays), now).ShouldBe(allowed);
    }

    [Fact]
    public void Retries_back_off_and_stop_at_three_attempts()
    {
        FetchSagaRules.MaxAttempts.ShouldBe(3);
        FetchSagaRules.RetryDelay(1).ShouldBeLessThan(FetchSagaRules.RetryDelay(2));
        FetchSagaRules.RetryDelay(2).ShouldBeLessThan(FetchSagaRules.RetryDelay(3));
        FetchSagaRules.RetryDelay(9).ShouldBe(FetchSagaRules.RetryDelay(3));
    }
}

public class DeliveryBoxTests
{
    [Fact]
    public void A_sealed_payload_opens_only_with_the_users_private_key()
    {
        var (pk, sk) = DeliveryBox.CreateKeyPair();
        var (otherPk, otherSk) = DeliveryBox.CreateKeyPair();
        var secret = Encoding.UTF8.GetBytes("balance 12345.67");

        var sealedBytes = DeliveryBox.Seal(pk, secret);
        sealedBytes.Length.ShouldBe(secret.Length + DeliveryBox.Overhead);
        DeliveryBox.Open(sealedBytes, pk, sk).ShouldBe(secret);
        Should.Throw<CryptographicException>(() => DeliveryBox.Open(sealedBytes, otherPk, otherSk));

        sealedBytes[^1] ^= 1;
        Should.Throw<CryptographicException>(() => DeliveryBox.Open(sealedBytes, pk, sk), "tampering is detected");
    }

    [Fact]
    public void Every_seal_uses_a_fresh_ephemeral_key()
    {
        var (pk, _) = DeliveryBox.CreateKeyPair();
        DeliveryBox.Seal(pk, [1, 2, 3]).ShouldNotBe(DeliveryBox.Seal(pk, [1, 2, 3]));
    }

    [Fact]
    public void Malformed_keys_are_refused()
    {
        Should.Throw<ArgumentException>(() => DeliveryBox.Seal(new byte[32], [1]));
        Should.Throw<ArgumentException>(() => DeliveryBox.Seal(new byte[31], [1]));
        DeliveryBox.IsValidPublicKey(RandomNumberGenerator.GetBytes(32)).ShouldBeTrue();
    }

    [Fact]
    public void The_envelope_binds_payload_id_and_kind()
    {
        var (pk, sk) = DeliveryBox.CreateKeyPair();
        var id = Guid.CreateVersion7();
        var sealedBytes = SealedEnvelope.Seal(pk, id, "aa.fi-bundle.v1", new { hello = "world" });
        Should.Throw<CryptographicException>(() => SealedEnvelope.Open<object>(sealedBytes, pk, sk, Guid.CreateVersion7(), "aa.fi-bundle.v1"),
            "a payload listed under another id is refused");
        Should.Throw<CryptographicException>(() => SealedEnvelope.Open<object>(sealedBytes, pk, sk, id, "credit.report.v1"));
        SealedEnvelope.Open<Dictionary<string, string>>(sealedBytes, pk, sk, id, "aa.fi-bundle.v1")["hello"].ShouldBe("world");
    }
}

public class FakeProviderTests
{
    private static readonly string[] AllTypes = [.. FiTypes.All];

    private static async Task<FiBundle> Fetch(FakeBankDataProvider provider, Guid user, string[] types, DateOnly from, DateOnly to)
    {
        var created = await provider.CreateConsentAsync(new ConsentRequest(Guid.CreateVersion7(), user, null, types, from, to,
            FetchFrequency.Weekly, DateTimeOffset.UtcNow.AddDays(30)), TestContext.Current.CancellationToken);
        var started = await provider.RequestFiDataAsync(created.Handle, from, to, TestContext.Current.CancellationToken);
        var result = await provider.FetchFiDataAsync(new FiFetchContext(Guid.CreateVersion7(), created.Handle, started.SessionId, types, from, to,
            DateTimeOffset.UtcNow), TestContext.Current.CancellationToken);
        result.Bundle.ShouldNotBeNull();
        result.CostUnits.ShouldBe(result.Bundle.AccountCount);
        return result.Bundle;
    }

    [Fact]
    public async Task The_same_user_and_window_give_the_same_data_across_consents_and_instances()
    {
        var user = Guid.CreateVersion7();
        var from = new DateOnly(2026, 5, 1);
        var to = new DateOnly(2026, 10, 26);
        var a = await Fetch(new FakeBankDataProvider(new()), user, AllTypes, from, to);
        var b = await Fetch(new FakeBankDataProvider(new()), user, AllTypes, from, to);
        a.Deposits.Select(d => d.MaskedAccountNumber).ShouldBe(b.Deposits.Select(d => d.MaskedAccountNumber));
        a.Deposits[0].Transactions.Select(t => (t.TxnId, t.Amount, t.Reference))
            .ShouldBe(b.Deposits[0].Transactions.Select(t => (t.TxnId, t.Amount, t.Reference)));
        a.MutualFunds[0].Holdings.Select(h => h.Units).ShouldBe(b.MutualFunds[0].Holdings.Select(h => h.Units));

        var someoneElse = await Fetch(new FakeBankDataProvider(new()), Guid.CreateVersion7(), AllTypes, from, to);
        someoneElse.Deposits[0].Transactions.Select(t => t.Amount).ShouldNotBe(a.Deposits[0].Transactions.Select(t => t.Amount));
    }

    [Fact]
    public async Task Sample_data_looks_like_a_real_month_of_banking()
    {
        var to = new DateOnly(2026, 10, 26);
        var bundle = await Fetch(new FakeBankDataProvider(new()), Guid.CreateVersion7(), AllTypes, to.AddDays(-90), to);

        var savings = bundle.Deposits[0];
        savings.Transactions.Count.ShouldBeGreaterThan(40);
        savings.Transactions.ShouldContain(t => t.Narration.Contains("SALARY", StringComparison.Ordinal) && t.Type == "CREDIT");
        savings.Transactions.ShouldContain(t => t.Mode == "UPI" && t.Reference.Length == 12);
        savings.Transactions.ShouldAllBe(t => t.ValueDate >= to.AddDays(-90) && t.ValueDate <= to);
        savings.MaskedAccountNumber.ShouldStartWith("XXXXXXXX");
        foreach (var t in savings.Transactions)
        {
            decimal.Parse(t.Amount, CultureInfo.InvariantCulture).ShouldBeGreaterThan(0);
            decimal.Parse(t.BalanceAfter, CultureInfo.InvariantCulture).ShouldBeGreaterThanOrEqualTo(0, "never overdrawn");
        }
        savings.CurrentBalance.ShouldBe(savings.Transactions[^1].BalanceAfter);

        bundle.TermDeposits.Select(d => d.Kind).ShouldBe(["TERM", "RECURRING"]);
        bundle.MutualFunds.Single().Holdings.Select(h => h.SchemeCode).ShouldBe(["122639", "119552", "120828"]);
        bundle.Equities.Single().Holdings.ShouldContain(h => h.Kind == "ETF");
        bundle.Retirement.Select(r => r.Kind).ShouldBe(["EPF", "PPF"]);
        bundle.Insurance.Select(i => i.PolicyType).ShouldBe(["TERM", "HEALTH"]);
        bundle.Nps.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Only_the_consented_FI_types_are_returned()
    {
        var to = new DateOnly(2026, 10, 26);
        var bundle = await Fetch(new FakeBankDataProvider(new()), Guid.CreateVersion7(), [FiTypes.MutualFunds], to.AddDays(-30), to);
        bundle.MutualFunds.ShouldHaveSingleItem();
        bundle.Deposits.ShouldBeEmpty();
        bundle.Insurance.ShouldBeEmpty();
        bundle.Retirement.ShouldBeEmpty();
    }

    [Fact]
    public async Task Consents_are_approved_on_first_check_unless_auto_approve_is_off()
    {
        var request = new ConsentRequest(Guid.CreateVersion7(), Guid.CreateVersion7(), null, [FiTypes.Deposit],
            new DateOnly(2026, 1, 1), new DateOnly(2026, 2, 1), FetchFrequency.Weekly, DateTimeOffset.UtcNow.AddDays(1));
        var auto = new FakeBankDataProvider(new());
        var handle = (await auto.CreateConsentAsync(request, TestContext.Current.CancellationToken)).Handle;
        (await auto.GetConsentStatusAsync(handle, TestContext.Current.CancellationToken)).ShouldBe(ConsentStatus.Active);

        var manual = new FakeBankDataProvider(new() { AutoApprove = false });
        handle = (await manual.CreateConsentAsync(request, TestContext.Current.CancellationToken)).Handle;
        (await manual.GetConsentStatusAsync(handle, TestContext.Current.CancellationToken)).ShouldBe(ConsentStatus.Pending);

        await manual.RevokeConsentAsync(handle, TestContext.Current.CancellationToken);
        (await Should.ThrowAsync<BankDataProviderException>(() =>
            manual.RequestFiDataAsync(handle, request.DataFrom, request.DataTo, TestContext.Current.CancellationToken))).Transient.ShouldBeFalse();
    }

    [Fact]
    public void Callbacks_must_be_signed_and_fresh()
    {
        var provider = new FakeBankDataProvider(new());
        var now = DateTimeOffset.UtcNow;
        var body = Encoding.UTF8.GetBytes("""{"type":"consent_status","consent_handle":"fake-x-y","status":"REVOKED"}""");
        var ts = now.ToUnixTimeSeconds();
        var sig = FakeBankDataProvider.SignCallback(FakeBankDataProvider.DevelopmentCallbackSecret, ts, body);
        Func<string, string?> Headers(long t, string? s) => name => name switch
        {
            FakeBankDataProvider.TimestampHeader => t.ToString(CultureInfo.InvariantCulture),
            FakeBankDataProvider.SignatureHeader => s,
            _ => null,
        };

        var ok = provider.VerifyCallback(body, Headers(ts, sig), now);
        ok.ShouldNotBeNull();
        ok.Status.ShouldBe(ConsentStatus.Revoked);
        ok.ConsentHandle.ShouldBe("fake-x-y");

        provider.VerifyCallback(body, Headers(ts, null), now).ShouldBeNull("unsigned");
        provider.VerifyCallback(body, Headers(ts, new string('0', 64)), now).ShouldBeNull("wrong signature");
        provider.VerifyCallback(body, Headers(ts, sig), now.AddMinutes(10)).ShouldBeNull("stale");
        provider.VerifyCallback([.. body, (byte)' '], Headers(ts, sig), now).ShouldBeNull("body changed");
        provider.VerifyCallback(body, Headers(ts, FakeBankDataProvider.SignCallback("another-secret-that-is-long-enough!!", ts, body)), now)
            .ShouldBeNull("signed with another key");
    }
}

public class ProviderGuardTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "aa";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IServiceCollection Register(string environment, params (string Key, string? Value)[] settings)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings.Select(s => new KeyValuePair<string, string?>(s.Key, s.Value))).Build();
        return new ServiceCollection().AddAccountAggregatorInfrastructure(configuration, new Env(environment));
    }

    [Fact]
    public void Sample_bank_data_is_refused_in_Production()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production, ("Providers:AccountAggregator", "Fake")))
            .Message.ShouldContain("not allowed in Production");
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production), "unset means Fake, and is refused too");
    }

    [Fact]
    public void Outside_Development_the_sample_needs_its_own_callback_secret()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, ("Providers:AccountAggregator", "Fake")));
        Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, ("Providers:AccountAggregator", "Fake"),
            ("Providers:FakeAa:CallbackSecret", "short")));
        Register(Environments.Staging, ("Providers:AccountAggregator", "Fake"),
            ("Providers:FakeAa:CallbackSecret", new string('k', 40))).ShouldContain(d => d.ServiceType == typeof(IBankDataProvider));
    }

    [Fact]
    public void Unbuilt_or_unknown_adapters_stop_startup()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Development, ("Providers:AccountAggregator", "Finvu")))
            .Message.ShouldContain("not built");
        Should.Throw<InvalidOperationException>(() => Register(Environments.Development, ("Providers:AccountAggregator", "Guess")));
    }

    [Fact]
    public void Development_runs_the_sample()
    {
        Register(Environments.Development).ShouldContain(d => d.ImplementationType == typeof(FakeBankDataProvider));
    }
}
