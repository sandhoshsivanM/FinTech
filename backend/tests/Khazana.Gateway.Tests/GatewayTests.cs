using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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
}
