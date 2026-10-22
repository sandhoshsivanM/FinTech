using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Shouldly;

namespace Khazana.Admin.Tests;

/// <summary>Plays Audit & Reporting: answers from a script and remembers the order of calls.</summary>
public sealed class FakeReporting : HttpMessageHandler
{
    public List<string> Calls { get; } = [];
    public bool AuditDown { get; set; }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.PathAndQuery;
        Calls.Add($"{request.Method} {path}");
        request.Headers.GetValues("X-Khazana-Internal-Key").Single().ShouldBe(AdminHost.Key);
        if (request.Method == HttpMethod.Post && path.StartsWith("/internal/admin/audit", StringComparison.Ordinal))
            return Task.FromResult(new HttpResponseMessage(AuditDown ? HttpStatusCode.InternalServerError : HttpStatusCode.NoContent));
        var json = path switch
        {
            _ when path.StartsWith("/internal/admin/metrics", StringComparison.Ordinal) =>
                """{"total_users":4242,"active7_days":17,"active30_days":40,"pending_deletions":1,"signups_by_day":[{"day":"2026-10-21","count":3}],"signins_by_day":[],"users_by_platform":{"ios":3}}""",
            _ when path.StartsWith("/internal/admin/audit?", StringComparison.Ordinal) =>
                """{"items":[{"id":7,"at":"2026-10-22T08:00:00Z","actor":"admin:x@y","action":"admin.view.users","target":"page:users","reason":null}],"page":1,"page_size":50,"total":1}""",
            _ when path.StartsWith("/internal/admin/users?", StringComparison.Ordinal) =>
                """{"items":[],"page":1,"page_size":25,"total":0}""",
            _ => "{}",
        };
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
    }
}

public sealed class AdminHost : WebApplicationFactory<Program>
{
    public const string Key = "admin-test-internal-key-0123456789abcdef";
    public FakeReporting Reporting { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Admin:ReportingKey", Key);
        builder.UseSetting("Admin:ReportingUrl", "http://reporting-api");
        builder.ConfigureServices(s => s.AddHttpClient<ReportingClient>().ConfigurePrimaryHttpMessageHandler(() => Reporting));
    }

    public HttpClient Browser() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false, HandleCookies = true,
    });
}

public sealed partial class AdminTests : IDisposable
{
    private readonly AdminHost _host = new();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [GeneratedRegex("name=\"__RequestVerificationToken\" value=\"([^\"]+)\"")]
    private static partial Regex Antiforgery();

    private static async Task SignIn(HttpClient browser, string role)
    {
        var page = await (await browser.GetAsync(new Uri("/login", UriKind.Relative), Ct)).Content.ReadAsStringAsync(Ct);
        var token = Antiforgery().Match(page).Groups[1].Value;
        using var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["role"] = role, ["__RequestVerificationToken"] = token });
        var response = await browser.PostAsync(new Uri("/login/dev", UriKind.Relative), form, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
    }

    [Fact]
    public async Task Nobody_gets_in_without_signing_in()
    {
        using var browser = _host.Browser();
        var response = await browser.GetAsync(new Uri("/", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        response.Headers.Location!.ToString().ShouldContain("/login");
        _host.Reporting.Calls.ShouldBeEmpty();
    }

    [Fact]
    public async Task Every_view_is_audited_before_any_data_is_read()
    {
        using var browser = _host.Browser();
        await SignIn(browser, "support");
        var response = await browser.GetAsync(new Uri("/", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldContain("4242");
        _host.Reporting.Calls.ShouldBe(["POST /internal/admin/audit", "GET /internal/admin/metrics?days=30"]);
    }

    [Fact]
    public async Task When_the_audit_log_is_down_nothing_is_shown()
    {
        using var browser = _host.Browser();
        await SignIn(browser, "support");
        _host.Reporting.AuditDown = true;
        var response = await browser.GetAsync(new Uri("/", UriKind.Relative), Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldNotContain("4242");
        _host.Reporting.Calls.ShouldNotContain(c => c.StartsWith("GET /internal/admin/metrics", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Only_the_security_role_opens_the_audit_log()
    {
        using (var support = _host.Browser())
        {
            await SignIn(support, "support");
            var denied = await support.GetAsync(new Uri("/audit", UriKind.Relative), Ct);
            denied.StatusCode.ShouldBe(HttpStatusCode.Redirect);
            denied.Headers.Location!.ToString().ShouldContain("/denied");
        }
        using var security = _host.Browser();
        await SignIn(security, "security");
        var ok = await security.GetAsync(new Uri("/audit", UriKind.Relative), Ct);
        ok.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await ok.Content.ReadAsStringAsync(Ct)).ShouldContain("admin.view.users");
    }

    [Fact]
    public async Task Pages_forbid_every_script_and_sign_out_needs_the_form_token()
    {
        using var browser = _host.Browser();
        var login = await browser.GetAsync(new Uri("/login", UriKind.Relative), Ct);
        login.Headers.GetValues("Content-Security-Policy").Single().ShouldContain("script-src 'none'");
        login.Headers.CacheControl!.NoStore.ShouldBeTrue();

        await SignIn(browser, "support");
        (await browser.PostAsync(new Uri("/logout", UriKind.Relative), new FormUrlEncodedContent([]), Ct))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest, "a forged cross-site sign-out is refused");
    }

    [Fact]
    public async Task A_cross_site_sign_in_without_the_form_token_is_refused()
    {
        using var browser = _host.Browser();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["role"] = "security" });
        (await browser.PostAsync(new Uri("/login/dev", UriKind.Relative), form, Ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void Outside_Development_cookies_are_Secure_host_only_cookies()
    {
        using var staging = new AdminHost().WithWebHostBuilder(b => b.UseEnvironment("Staging").UseSetting("Admin:DevLogin", "false")
            .UseSetting("Admin:Oidc:Authority", "https://login.example.com").UseSetting("Admin:Oidc:ClientId", "khazana-admin"));
        var services = staging.Services;
        var session = services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(CookieAuthenticationDefaults.AuthenticationScheme).Cookie;
        var antiforgery = services.GetRequiredService<IOptions<AntiforgeryOptions>>().Value.Cookie;
        foreach (var cookie in new[] { session, antiforgery })
        {
            cookie.Name!.ShouldStartWith("__Host-");
            cookie.SecurePolicy.ShouldBe(CookieSecurePolicy.Always);
        }
        session.SameSite.ShouldBe(SameSiteMode.Lax, "Strict would drop the cookie on the identity provider's return trip and loop the sign-in");
        session.HttpOnly.ShouldBeTrue();
    }

    [Theory]
    [InlineData("1234567890", "admin:1234567890")]
    [InlineData("o'brien@example.com", null)]
    public void Admins_are_recorded_by_their_subject_hashed_if_it_does_not_fit(string sub, string? expected)
    {
        var actor = ReportingClient.Actor(new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
            [new System.Security.Claims.Claim("sub", sub)], "test")));
        if (expected is not null) actor.ShouldBe(expected);
        else actor.ShouldMatch("^admin:[0-9a-f]{32}$");
    }

    [Fact]
    public void The_dev_sign_in_and_a_short_key_are_refused_at_startup()
    {
        using var prod = new AdminHost().WithWebHostBuilder(b => b.UseEnvironment("Production").UseSetting("Admin:DevLogin", "true"));
        Should.Throw<InvalidOperationException>(() => prod.CreateClient()).Message.ShouldContain("DevLogin");
        using var shortKey = new AdminHost().WithWebHostBuilder(b => b.UseSetting("Admin:ReportingKey", "short"));
        Should.Throw<InvalidOperationException>(() => shortKey.CreateClient()).Message.ShouldContain("ReportingKey");
    }

    public void Dispose() => _host.Dispose();
}
