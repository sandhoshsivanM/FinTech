using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Khazana.Gateway.Tests;

/// <summary>
/// The edge rules, tested with no backend behind the gateway: a request that
/// passes the rules fails upstream (502/503), one that breaks a rule never
/// leaves the gateway.
/// </summary>
public sealed class GatewayTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
    {
        b.UseEnvironment("Production");
        b.UseSetting("RateLimits:Public:PermitLimit", "3");
        b.UseSetting("RateLimits:Public:WindowSeconds", "60");
        // Service discovery resolves the cluster name to a closed local port.
        b.UseSetting("RateLimits:Auth:PermitLimit", "2");
        b.UseSetting("services:marketdata-api:http:0", "http://127.0.0.1:9");
        b.UseSetting("services:identity-api:http:0", "http://127.0.0.1:9");
        b.UseSetting("services:devices-api:http:0", "http://127.0.0.1:9");
        b.UseSetting("services:sync-api:http:0", "http://127.0.0.1:9");
        b.UseSetting("services:notification-api:http:0", "http://127.0.0.1:9");
        b.UseSetting("services:catalog-api:http:0", "http://127.0.0.1:9");
    });

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Every_response_carries_the_security_headers()
    {
        using var client = _factory.CreateClient();
        using var response = await client.GetAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), TestContext.Current.CancellationToken);
        response.Headers.GetValues("X-Content-Type-Options").ShouldBe(["nosniff"]);
        response.Headers.GetValues("X-Frame-Options").ShouldBe(["DENY"]);
        response.Headers.GetValues("Referrer-Policy").ShouldBe(["no-referrer"]);
        response.Headers.GetValues("Content-Security-Policy").Single().ShouldContain("default-src 'none'");
    }

    [Fact]
    public async Task The_fourth_request_in_the_window_is_rate_limited()
    {
        using var client = _factory.CreateClient();
        for (var i = 0; i < 3; i++)
        {
            using var allowed = await client.GetAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), TestContext.Current.CancellationToken);
            allowed.StatusCode.ShouldNotBe(HttpStatusCode.TooManyRequests);
        }
        using var limited = await client.GetAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), TestContext.Current.CancellationToken);
        limited.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Only_GET_and_HEAD_reach_market_data()
    {
        using var client = _factory.CreateClient();
        using var response = await client.PostAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), content: null, TestContext.Current.CancellationToken);
        // 405, answered by the gateway itself: had the POST been forwarded, the
        // unreachable upstream would have produced a 502 instead.
        response.StatusCode.ShouldBe(HttpStatusCode.MethodNotAllowed);
    }

    [Theory]
    [InlineData("/internal/market/nav/ingest")]
    [InlineData("/health")]
    [InlineData("/v1/admin")]
    [InlineData("/.well-known/jwks.json")]
    [InlineData("/.well-known/openid-configuration")]
    [InlineData("/internal/catalog/publish")]
    [InlineData("/internal/admin/metrics")]
    public async Task Nothing_outside_the_public_routes_is_exposed(string path)
    {
        using var client = _factory.CreateClient();
        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Sign_in_is_forwarded_but_only_as_POST()
    {
        using var client = _factory.CreateClient();
        using var post = await client.PostAsync(new Uri("/v1/auth/token", UriKind.Relative), content: null, TestContext.Current.CancellationToken);
        ((int)post.StatusCode).ShouldBeGreaterThanOrEqualTo(500, "forwarded to the (absent) Identity service");
        using var get = await client.GetAsync(new Uri("/v1/auth/token", UriKind.Relative), TestContext.Current.CancellationToken);
        get.StatusCode.ShouldBe(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task Account_restore_is_forwarded_as_POST()
    {
        using var client = _factory.CreateClient();
        using var post = await client.PostAsync(new Uri("/v1/account/restore", UriKind.Relative), content: null, TestContext.Current.CancellationToken);
        ((int)post.StatusCode).ShouldBeGreaterThanOrEqualTo(500, "forwarded to the (absent) Identity service");
    }

    [Fact]
    public async Task Sign_in_has_its_own_tighter_limit()
    {
        using var client = _factory.CreateClient();
        for (var i = 0; i < 2; i++)
        {
            using var allowed = await client.PostAsync(new Uri("/v1/auth/refresh", UriKind.Relative), content: null, TestContext.Current.CancellationToken);
            allowed.StatusCode.ShouldNotBe(HttpStatusCode.TooManyRequests);
        }
        using var limited = await client.PostAsync(new Uri("/v1/auth/token", UriKind.Relative), content: null, TestContext.Current.CancellationToken);
        limited.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);

        // Market data has a separate bucket, unaffected.
        using var market = await client.GetAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), TestContext.Current.CancellationToken);
        market.StatusCode.ShouldNotBe(HttpStatusCode.TooManyRequests);
    }

    [Theory]
    [InlineData("GET", "/v1/devices/")]
    [InlineData("PATCH", "/v1/devices/0198f0a0-0000-7000-8000-000000000000")]
    [InlineData("POST", "/v1/auth/step-up")]
    [InlineData("DELETE", "/v1/devices/0198f0a0-0000-7000-8000-000000000000")]
    [InlineData("PUT", "/v1/keys/envelopes/recovery")]
    [InlineData("POST", "/v1/push/register")]
    [InlineData("GET", "/v1/catalog")]
    [InlineData("GET", "/v1/catalog/keys")]
    public async Task Device_and_key_routes_are_forwarded(string method, string path)
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        ((int)response.StatusCode).ShouldBeGreaterThanOrEqualTo(500, "forwarded to the (absent) Devices service");
    }

    [Fact]
    public async Task A_sync_push_with_a_large_body_is_forwarded()
    {
        using var client = _factory.CreateClient();
        var big = new string('x', 200 * 1024);
        using var push = await client.PostAsync(new Uri("/v1/sync/push", UriKind.Relative),
            new StringContent(big), TestContext.Current.CancellationToken);
        ((int)push.StatusCode).ShouldBeGreaterThanOrEqualTo(500, "forwarded: 200 KB is within the sync limit");
        // The 64 KB default for every other route is a Kestrel limit, which the
        // in-memory test server does not enforce; it was checked against a live run.
    }
    [Fact]
    public async Task A_forged_forwarded_address_from_an_untrusted_peer_does_not_buy_a_new_bucket()
    {
        // The in-memory server has no peer address, and ASP.NET trusts the header
        // when there is none; a real connection always has one, so give it one.
        using var factory = _factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
            s.AddSingleton<Microsoft.AspNetCore.Hosting.IStartupFilter, FakePeer>()));
        using var client = factory.CreateClient();
        for (var i = 0; i < 3; i++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/v1/market/nav/latest");
            request.Headers.Add("X-Forwarded-For", $"203.0.113.{i}");
            (await client.SendAsync(request, TestContext.Current.CancellationToken)).StatusCode.ShouldNotBe(HttpStatusCode.TooManyRequests);
        }
        using var fourth = new HttpRequestMessage(HttpMethod.Get, "/v1/market/nav/latest");
        fourth.Headers.Add("X-Forwarded-For", "198.51.100.77");
        (await client.SendAsync(fourth, TestContext.Current.CancellationToken)).StatusCode
            .ShouldBe(HttpStatusCode.TooManyRequests, "no trusted proxies are configured, so the header is ignored");
    }
}

public sealed class UserBucketTests
{
    private static string TokenFor(string jkt) => new Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler().CreateToken(
        new Microsoft.IdentityModel.Tokens.SecurityTokenDescriptor
        {
            Claims = new Dictionary<string, object> { ["cnf"] = new Dictionary<string, object> { ["jkt"] = jkt } },
        });

    [Fact]
    public async Task Two_users_behind_one_address_each_get_their_own_limit()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            b.UseSetting("RateLimits:User:PermitLimit", "1");
            b.UseSetting("services:devices-api:http:0", "http://127.0.0.1:9");
        });
        using var client = factory.CreateClient();
        async Task<HttpStatusCode> Get(string jkt)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/v1/devices/");
            request.Headers.TryAddWithoutValidation("Authorization", $"DPoP {TokenFor(jkt)}");
            return (await client.SendAsync(request, TestContext.Current.CancellationToken)).StatusCode;
        }
        (await Get("alice-key")).ShouldNotBe(HttpStatusCode.TooManyRequests);
        (await Get("bob-key")).ShouldNotBe(HttpStatusCode.TooManyRequests, "bob is not alice");
        (await Get("alice-key")).ShouldBe(HttpStatusCode.TooManyRequests, "alice's own limit is 1");
    }
}

public sealed class TrustedProxyTests
{
    [Fact]
    public async Task Behind_a_trusted_proxy_each_client_address_gets_its_own_bucket()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            b.UseSetting("RateLimits:Public:PermitLimit", "1");
            b.UseSetting("Gateway:TrustedProxies:0", "10.20.30.0/24");
            b.UseSetting("services:marketdata-api:http:0", "http://127.0.0.1:9");
            b.ConfigureServices(s => s.AddSingleton<Microsoft.AspNetCore.Hosting.IStartupFilter, FakePeer>());
        });
        using var client = factory.CreateClient();
        foreach (var address in new[] { "203.0.113.1", "203.0.113.2" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/v1/market/nav/latest");
            request.Headers.Add("X-Forwarded-For", address);
            (await client.SendAsync(request, TestContext.Current.CancellationToken)).StatusCode
                .ShouldNotBe(HttpStatusCode.TooManyRequests, "two users behind one balancer don't share a bucket");
        }
    }
}

/// <summary>Gives every test request a peer address, as a real connection has.</summary>
internal sealed class FakePeer : Microsoft.AspNetCore.Hosting.IStartupFilter
{
    public Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> Configure(Action<Microsoft.AspNetCore.Builder.IApplicationBuilder> next) => app =>
    {
        app.Use(nextMiddleware => ctx =>
        {
            ctx.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("10.20.30.40");
            return nextMiddleware(ctx);
        });
        next(app);
    };
}

/// <summary>
/// Khazana Online's web app calls the gateway from its own origin (ADR 0007):
/// only listed origins get CORS headers, and with none listed nobody does.
/// </summary>
public sealed class CorsTests
{
    private static WebApplicationFactory<Program> Gateway(params string[] origins) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            b.UseSetting("services:identity-api:http:0", "http://127.0.0.1:9");
            for (var i = 0; i < origins.Length; i++) b.UseSetting($"Gateway:AllowedOrigins:{i}", origins[i]);
        });

    private static async Task<HttpResponseMessage> Preflight(HttpClient client, string origin)
    {
        using var request = new HttpRequestMessage(HttpMethod.Options, "/v1/auth/token");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "dpop,content-type");
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_listed_origin_may_call_with_a_DPoP_header()
    {
        using var factory = Gateway("https://online.khazana.test");
        using var client = factory.CreateClient();
        using var response = await Preflight(client, "https://online.khazana.test");
        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        response.Headers.GetValues("Access-Control-Allow-Origin").ShouldBe(["https://online.khazana.test"]);
        response.Headers.GetValues("Access-Control-Allow-Headers").Single().ToUpperInvariant().ShouldContain("DPOP");
        response.Headers.Contains("Access-Control-Allow-Credentials").ShouldBeFalse();
    }

    [Fact]
    public async Task Any_other_origin_gets_no_CORS_headers()
    {
        using var factory = Gateway("https://online.khazana.test");
        using var client = factory.CreateClient();
        using var response = await Preflight(client, "https://evil.test");
        response.Headers.Contains("Access-Control-Allow-Origin").ShouldBeFalse();
    }

    [Fact]
    public async Task With_no_origins_listed_nobody_gets_CORS_headers()
    {
        using var factory = Gateway();
        using var client = factory.CreateClient();
        using var response = await Preflight(client, "https://online.khazana.test");
        response.Headers.Contains("Access-Control-Allow-Origin").ShouldBeFalse();
    }

    [Theory]
    [InlineData("*")]
    [InlineData("https://online.khazana.test/")]
    [InlineData("https://online.khazana.test/app")]
    [InlineData("ftp://online.khazana.test")]
    public void A_wildcard_or_malformed_origin_stops_startup(string origin)
    {
        using var factory = Gateway(origin);
        Should.Throw<InvalidOperationException>(() => factory.CreateClient());
    }
}
