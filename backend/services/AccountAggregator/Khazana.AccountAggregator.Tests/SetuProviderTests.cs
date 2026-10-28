using System.Net;
using System.Text;
using System.Text.Json;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;
using Khazana.AccountAggregator.Infrastructure;
using Khazana.SharedKernel;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Shouldly;

namespace Khazana.AccountAggregator.Tests;

/// <summary>
/// The Setu adapter against recorded responses (fixtures/setu, shaped like
/// Setu's documented examples). No call leaves the test process.
/// </summary>
public sealed class SetuProviderTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateTimeOffset Now = new(2026, 10, 28, 9, 0, 0, TimeSpan.Zero);

    private sealed class FixedClock : IClock
    {
        public DateTimeOffset UtcNow { get; set; } = Now;
    }

    /// <summary>Answers each request from a script and records what was sent.</summary>
    private sealed class Recorder : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string? Body)> Sent { get; } = [];
        public Func<HttpRequestMessage, HttpResponseMessage> Answer { get; set; } = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            Sent.Add((request, body));
            return Answer(request);
        }
    }

    private sealed class Factory(Recorder handler, string baseUrl) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false) { BaseAddress = new Uri(baseUrl) };
    }

    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "setu", name));

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static (SetuBankDataProvider Provider, Recorder Http) Create(string auth = "Token")
    {
        var http = new Recorder();
        var options = new SetuAaOptions
        {
            ClientId = "client-id", ClientSecret = "client-secret", ProductInstanceId = "product-1",
            RedirectUrl = "https://online.example/link/", Auth = auth,
        };
        return (new SetuBankDataProvider(options, new Factory(http, SetuAaOptions.SandboxBaseUrl + "/"), new FixedClock()), http);
    }

    private static HttpResponseMessage Route(HttpRequestMessage r)
    {
        var path = r.RequestUri!.AbsolutePath;
        return (r.Method.Method, path) switch
        {
            ("POST", "/v1/users/login") => Json("""{"access_token":"tok-1","expiresIn":1800}"""),
            ("POST", "/consents") => Json(Fixture("consent-created.json"), HttpStatusCode.Created),
            ("GET", "/consents/c16cc10e-eae3-4277-96e1-64c0ed21c53e") => Json(Fixture("consent-active.json")),
            ("POST", "/sessions") => Json(Fixture("session-created.json"), HttpStatusCode.Created),
            ("GET", "/sessions/32d40afc-4795-495d-8ca4-d817d730e5b5") => Json(Fixture("session-completed.json")),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        };
    }

    private static ConsentRequest Request(string? handle = "9999999999") => new(
        Guid.CreateVersion7(), Guid.CreateVersion7(), handle, [FiTypes.Deposit, FiTypes.MutualFunds],
        new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 28), FetchFrequency.Weekly, Now.AddDays(365));

    private static FiFetchContext Context(string session = "32d40afc-4795-495d-8ca4-d817d730e5b5") => new(
        Guid.CreateVersion7(), "c16cc10e-eae3-4277-96e1-64c0ed21c53e", session,
        [FiTypes.Deposit, FiTypes.MutualFunds, FiTypes.Equities, FiTypes.Insurance, FiTypes.Nps, FiTypes.TermDeposit],
        new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 28), Now);

    [Fact]
    public async Task A_consent_is_created_with_a_bearer_token_the_product_id_and_the_users_mobile_and_returns_the_approval_url()
    {
        var (setu, http) = Create();
        http.Answer = Route;

        var created = await setu.CreateConsentAsync(Request(), Ct);

        created.Handle.ShouldBe("c16cc10e-eae3-4277-96e1-64c0ed21c53e");
        created.RedirectUrl!.ToString().ShouldStartWith("https://fiu-sandbox.setu.co/consents/webview/");
        var login = http.Sent[0];
        login.Request.RequestUri!.ToString().ShouldBe(SetuAaOptions.DefaultTokenUrl);
        login.Body!.ShouldContain("\"clientID\":\"client-id\"");
        var consent = http.Sent[1];
        consent.Request.Headers.Authorization!.ToString().ShouldBe("Bearer tok-1");
        consent.Request.Headers.GetValues(SetuBankDataProvider.ProductInstanceHeader).ShouldBe(["product-1"]);
        consent.Request.Headers.Contains("x-client-secret").ShouldBeFalse("the secret only goes to the token endpoint");
        using var body = JsonDocument.Parse(consent.Body!);
        body.RootElement.GetProperty("vua").GetString().ShouldBe("9999999999");
        body.RootElement.GetProperty("fiTypes").EnumerateArray().Select(e => e.GetString()).ShouldBe([FiTypes.Deposit, FiTypes.MutualFunds]);
        body.RootElement.GetProperty("dataRange").GetProperty("from").GetString().ShouldBe("2026-04-01T00:00:00.000Z");
        body.RootElement.GetProperty("redirectUrl").GetString().ShouldBe("https://online.example/link/");
        body.RootElement.GetProperty("consentDuration").GetProperty("value").GetInt32().ShouldBe(365);

        // The token is reused for the next call.
        (await setu.GetConsentStatusAsync(created.Handle, Ct)).ShouldBe(ConsentStatus.Active);
        http.Sent.Count(s => s.Request.RequestUri!.AbsolutePath == "/v1/users/login").ShouldBe(1);
    }

    [Fact]
    public async Task Header_credentials_are_sent_when_the_Bridge_issued_those_instead()
    {
        var (setu, http) = Create(auth: "Headers");
        http.Answer = Route;
        await setu.GetConsentStatusAsync("c16cc10e-eae3-4277-96e1-64c0ed21c53e", Ct);
        var sent = http.Sent.ShouldHaveSingleItem().Request;
        sent.Headers.GetValues("x-client-id").ShouldBe(["client-id"]);
        sent.Headers.GetValues("x-client-secret").ShouldBe(["client-secret"]);
        sent.Headers.Authorization.ShouldBeNull();
    }

    [Fact]
    public async Task Without_the_users_mobile_no_consent_is_asked_for()
    {
        var (setu, http) = Create();
        (await Should.ThrowAsync<BankDataProviderException>(() => setu.CreateConsentAsync(Request(handle: null), Ct)))
            .Code.ShouldBe("aa_handle_required");
        http.Sent.ShouldBeEmpty();
        setu.NeedsAaHandle.ShouldBeTrue();
        setu.SupportedFiTypes.ShouldNotContain(FiTypes.Epf, "EPF and PPF are not on the AA network");
    }

    [Fact]
    public async Task A_data_session_waits_for_Setu_then_the_decrypted_JSON_is_normalised()
    {
        var (setu, http) = Create();
        http.Answer = Route;
        var started = await setu.RequestFiDataAsync("c16cc10e-eae3-4277-96e1-64c0ed21c53e", new DateOnly(2026, 4, 1), new DateOnly(2026, 10, 28), Ct);
        started.SessionId.ShouldBe("32d40afc-4795-495d-8ca4-d817d730e5b5");
        started.DataReady.ShouldBeFalse("Setu notifies, the saga polls meanwhile");
        using (var body = JsonDocument.Parse(http.Sent[^1].Body!))
            body.RootElement.GetProperty("format").GetString().ShouldBe("json");

        var result = await setu.FetchFiDataAsync(Context(), Ct);
        var bundle = result.Bundle.ShouldNotBeNull();
        result.CostUnits.ShouldBe(bundle.AccountCount);

        var deposit = bundle.Deposits.ShouldHaveSingleItem("the DENIED account is skipped");
        deposit.LinkRef.ShouldBe("e4b27e62-e41a-42c0-a5b3-0a5542b25ddf");
        deposit.MaskedAccountNumber.ShouldBe("XXXXXXXX6053");
        deposit.CurrentBalance.ShouldBe("101666.33");
        deposit.Ifsc.ShouldBe("SETU0000001");
        deposit.Transactions.Count.ShouldBe(2);
        var debit = deposit.Transactions.Single(t => t.Type == "DEBIT");
        debit.Amount.ShouldBe("450");
        debit.Mode.ShouldBe("UPI");
        debit.Reference.ShouldBe("311234567890");
        debit.At.ShouldBe(new DateTimeOffset(2026, 10, 20, 8, 15, 0, TimeSpan.FromHours(5.5)));

        var folio = bundle.MutualFunds.ShouldHaveSingleItem();
        folio.Holdings.Count.ShouldBe(2);
        folio.Holdings.Sum(h => decimal.Parse(h.CostValue, System.Globalization.CultureInfo.InvariantCulture)).ShouldBe(90000m, 0.02m);
        folio.Holdings[0].SchemeCode.ShouldBe("120503");

        var demat = bundle.Equities.ShouldHaveSingleItem();
        demat.Holdings.ShouldHaveSingleItem().CurrentValue.ShouldBe("29250");
        bundle.Insurance.ShouldHaveSingleItem().SumAssured.ShouldBe("10000000");
        bundle.Nps.ShouldHaveSingleItem().TotalValue.ShouldBe("245000.50");
        var fd = bundle.TermDeposits.ShouldHaveSingleItem();
        fd.MaturesOn.ShouldBe(new DateOnly(2027, 6, 1));
        bundle.Retirement.ShouldBeEmpty();
    }

    [Fact]
    public async Task Pending_sessions_are_not_ready_and_failed_or_expired_ones_end_the_fetch()
    {
        var (setu, http) = Create();
        var status = "PENDING";
        http.Answer = r => r.RequestUri!.AbsolutePath == "/v1/users/login"
            ? Json("""{"access_token":"t"}""")
            : Json($$"""{"id":"s","status":"{{status}}","fips":null}""");
        (await setu.FetchFiDataAsync(Context("s"), Ct)).Bundle.ShouldBeNull();
        status = "FAILED";
        var failed = await Should.ThrowAsync<BankDataProviderException>(() => setu.FetchFiDataAsync(Context("s"), Ct));
        failed.Code.ShouldBe("session_failed");
        failed.Transient.ShouldBeFalse();
        status = "EXPIRED";
        (await Should.ThrowAsync<BankDataProviderException>(() => setu.FetchFiDataAsync(Context("s"), Ct))).Code.ShouldBe("session_expired");
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, "provider_unavailable", true)]
    [InlineData(HttpStatusCode.TooManyRequests, "provider_busy", true)]
    [InlineData(HttpStatusCode.BadRequest, "provider_refused", false)]
    [InlineData(HttpStatusCode.NotFound, "provider_not_found", false)]
    public async Task Partner_errors_say_whether_a_retry_can_help_and_carry_no_response_body(HttpStatusCode code, string expected, bool transient)
    {
        var (setu, http) = Create(auth: "Headers");
        http.Answer = _ => Json("""{"errorMsg":"account 1234567890 holder RAVI"}""", code);
        var e = await Should.ThrowAsync<BankDataProviderException>(() => setu.GetConsentStatusAsync("c", Ct));
        e.Code.ShouldBe(expected);
        e.Transient.ShouldBe(transient);
        e.Message.ShouldNotContain("RAVI");
    }

    [Fact]
    public async Task Revoking_a_consent_Setu_no_longer_knows_is_done()
    {
        var (setu, http) = Create(auth: "Headers");
        http.Answer = _ => new HttpResponseMessage(HttpStatusCode.NotFound);
        await setu.RevokeConsentAsync("c16cc10e", Ct);
        http.Sent.ShouldHaveSingleItem().Request.RequestUri!.AbsolutePath.ShouldBe("/v2/consents/c16cc10e/revoke");
    }

    [Fact]
    public void Notifications_are_hints_only_and_stale_or_malformed_ones_are_dropped()
    {
        var (setu, _) = Create();
        string? NoHeader(string _) => null;
        var consent = Encoding.UTF8.GetBytes(Fixture("notify-consent.json").Replace("TS", Now.AddMinutes(-1).ToString("O"), StringComparison.Ordinal));
        var hint = setu.VerifyCallback(consent, NoHeader, Now).ShouldNotBeNull();
        hint.Kind.ShouldBe(AaCallbackKind.ConsentStatus);
        hint.ConsentHandle.ShouldBe("c16cc10e-eae3-4277-96e1-64c0ed21c53e");
        hint.Status.ShouldBeNull("the body says ACTIVE, but only Setu's authenticated API is believed");

        var session = Encoding.UTF8.GetBytes(Fixture("notify-session.json").Replace("TS", Now.ToString("O"), StringComparison.Ordinal));
        var ready = setu.VerifyCallback(session, NoHeader, Now).ShouldNotBeNull();
        ready.Kind.ShouldBe(AaCallbackKind.DataReady);
        ready.SessionId.ShouldBe("32d40afc-4795-495d-8ca4-d817d730e5b5");

        var stale = Encoding.UTF8.GetBytes(Fixture("notify-consent.json").Replace("TS", Now.AddHours(-3).ToString("O"), StringComparison.Ordinal));
        setu.VerifyCallback(stale, NoHeader, Now).ShouldBeNull();
        setu.VerifyCallback("not json"u8.ToArray(), NoHeader, Now).ShouldBeNull();
        setu.VerifyCallback("""{"type":"OTHER","consentId":"x","timestamp":"2026-10-28T09:00:00Z"}"""u8.ToArray(), NoHeader, Now).ShouldBeNull();
        setu.VerifyCallback("[]"u8.ToArray(), NoHeader, Now).ShouldBeNull();
    }
}

public sealed class SetuGuardTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "aa";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static readonly (string, string?)[] Credentials =
    [
        ("Providers:AccountAggregator", "Setu"),
        ("Providers:Setu:ClientId", "id"),
        ("Providers:Setu:ClientSecret", "secret"),
        ("Providers:Setu:ProductInstanceId", "product"),
    ];

    private static IServiceCollection Register(string environment, params (string Key, string? Value)[] settings)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings.Select(s => new KeyValuePair<string, string?>(s.Key, s.Value))).Build();
        return new ServiceCollection().AddAccountAggregatorInfrastructure(configuration, new Env(environment));
    }

    [Fact]
    public void Setu_needs_its_credentials_and_names_the_missing_ones()
    {
        var e = Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, ("Providers:AccountAggregator", "Setu")));
        e.Message.ShouldContain("Providers:Setu:ClientId");
        e.Message.ShouldContain("Providers:Setu:ProductInstanceId");
        Register(Environments.Staging, Credentials).ShouldContain(d => d.ImplementationType == typeof(SetuBankDataProvider));
    }

    [Fact]
    public void Production_refuses_Setus_sandbox_and_any_plain_http_address()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production, Credentials))
            .Message.ShouldContain("sandbox");
        Register(Environments.Production, [.. Credentials, ("Providers:Setu:BaseUrl", SetuAaOptions.ProductionBaseUrl),
            ("Providers:Setu:RedirectUrl", "https://online.example/link/")])
            .ShouldContain(d => d.ImplementationType == typeof(SetuBankDataProvider));
        Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, [.. Credentials, ("Providers:Setu:BaseUrl", "http://fiu-sandbox.setu.co")]));
        Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, [.. Credentials, ("Providers:Setu:RedirectUrl", "http://online.example/")]));
        Should.Throw<InvalidOperationException>(() => Register(Environments.Staging, [.. Credentials, ("Providers:Setu:Auth", "Guess")]));
    }

    [Fact]
    public void Fake_is_still_refused_in_Production()
    {
        Should.Throw<InvalidOperationException>(() => Register(Environments.Production, ("Providers:AccountAggregator", "Fake")));
    }
}
