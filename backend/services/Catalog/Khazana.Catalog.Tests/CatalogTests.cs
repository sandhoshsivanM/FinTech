using System.Net;
using System.Text;
using System.Text.Json;
using Khazana.Catalog.Application;
using Khazana.Catalog.Domain;
using Khazana.Catalog.Infrastructure;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using NSec.Cryptography;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.Catalog.Tests;

public class CatalogRulesTests
{
    internal static Offer Offer(string id = "hdfc-swiggy-10", DateOnly? from = null, DateOnly? to = null, string source = "https://www.hdfcbank.com/offers/swiggy") =>
        new(id, "hdfc", "visa", null, "Swiggy", "food", "cashback", 10m, 150m,
            from ?? new DateOnly(2026, 10, 1), to ?? new DateOnly(2026, 12, 31), source, new DateOnly(2026, 10, 20));

    [Fact]
    public void A_good_offer_passes() => CatalogRules.Validate(Offer()).ShouldBeNull();

    [Theory]
    [InlineData("http://example.com/offer")]
    [InlineData("javascript:alert(1)")]
    [InlineData("not a url")]
    public void Sources_must_be_https_links(string source) => CatalogRules.Validate(Offer(source: source)).ShouldNotBeNull();

    [Fact]
    public void Nonsense_is_refused()
    {
        CatalogRules.Validate(Offer() with { Benefit = "free-money" }).ShouldNotBeNull();
        CatalogRules.Validate(Offer() with { Issuer = null, Network = null, Product = null }).ShouldNotBeNull();
        CatalogRules.Validate(Offer(to: new DateOnly(2026, 9, 1))).ShouldNotBeNull();
        CatalogRules.Validate(new ParserTemplate("t1", "HDFC", "sms", ["VM-HDFCBK"], "{not json", 1)).ShouldNotBeNull();
    }

    [Fact]
    public void The_canonical_bytes_do_not_depend_on_order()
    {
        var a = new CatalogSnapshot(1, DateTimeOffset.UnixEpoch, [Offer("a"), Offer("b")], []);
        var b = new CatalogSnapshot(1, DateTimeOffset.UnixEpoch, [Offer("b"), Offer("a")], []);
        CatalogCanonical.Serialize(a).ShouldBe(CatalogCanonical.Serialize(b));
    }

    [Fact]
    public void A_signature_verifies_with_the_public_key_and_fails_on_any_change()
    {
        using var signer = new Ed25519CatalogSigner(new byte[32].Select((_, i) => (byte)i).ToArray());
        var payload = Encoding.UTF8.GetBytes("""{"version":1}""");
        var signature = signer.Sign(payload);
        var key = PublicKey.Import(SignatureAlgorithm.Ed25519, signer.PublicKey, KeyBlobFormat.RawPublicKey);
        SignatureAlgorithm.Ed25519.Verify(key, payload, signature).ShouldBeTrue();
        payload[^2] = (byte)'2';
        SignatureAlgorithm.Ed25519.Verify(key, payload, signature).ShouldBeFalse();
    }
}

public sealed class TestClock : IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

public sealed class CatalogHost : IAsyncLifetime
{
    public const string Key = "catalog-test-internal-key-0123456789abcdef";
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public TestClock Clock { get; } = new();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__catalog", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Environment.SetEnvironmentVariable("Catalog__InternalKey", Key);
        Environment.SetEnvironmentVariable("Catalog__Sweeper__Enabled", "true");
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IClock>();
                s.AddSingleton<IClock>(Clock);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(CatalogProbe)));
            }));
        _ = Factory.Server;
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}

public static class CatalogProbe
{
    public static void Handle(CatalogPublishedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(CatalogTestGroup))]
public sealed class CatalogTestGroup : ICollectionFixture<CatalogHost>;

[Collection(nameof(CatalogTestGroup))]
public sealed class CatalogFlowTests(CatalogHost host) : IDisposable
{
    private static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _client = host.Factory.CreateClient();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpResponseMessage> Curate(HttpMethod method, string path, object? body = null, string? key = CatalogHost.Key)
    {
        using var request = new HttpRequestMessage(method, path);
        if (key is not null) request.Headers.Add("X-Khazana-Internal-Key", key);
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body, Snake), Encoding.UTF8, "application/json");
        return await _client.SendAsync(request, Ct);
    }

    private async Task<ITrackedSession> Publish() =>
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                (await Curate(HttpMethod.Post, "/internal/catalog/publish")).StatusCode.ShouldBe(HttpStatusCode.OK)));

    private async Task<(long Version, JsonElement Payload)> FetchVerified()
    {
        var keys = JsonDocument.Parse(await _client.GetStringAsync(new Uri("/v1/catalog/keys", UriKind.Relative), Ct)).RootElement;
        var publicKey = PublicKey.Import(SignatureAlgorithm.Ed25519, keys[0].GetProperty("public_key").GetBytesFromBase64(), KeyBlobFormat.RawPublicKey);
        var envelope = JsonDocument.Parse(await _client.GetStringAsync(new Uri("/v1/catalog", UriKind.Relative), Ct)).RootElement;
        var payload = envelope.GetProperty("payload").GetBytesFromBase64();
        SignatureAlgorithm.Ed25519.Verify(publicKey, payload, envelope.GetProperty("signature").GetBytesFromBase64())
            .ShouldBeTrue("the app refuses any catalog whose signature doesn't verify");
        return (envelope.GetProperty("version").GetInt64(), JsonDocument.Parse(payload).RootElement);
    }

    [Fact]
    public async Task Curated_offers_are_published_signed_announced_and_served_once_per_version()
    {
        (await Curate(HttpMethod.Put, "/internal/catalog/offers/axis-amazon-5", CatalogRulesTests.Offer("axis-amazon-5") with { Issuer = "axis", Merchant = "Amazon" }))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Curate(HttpMethod.Put, "/internal/catalog/templates/hdfc-sms", new ParserTemplate("hdfc-sms", "HDFC", "sms", ["VM-HDFCBK", "AD-HDFCBK"], """{"amount":"Rs\\.?\\s?([\\d,]+)"}""", 2)))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var tracked = await Publish();
        var announced = tracked.Received.SingleMessage<CatalogPublishedV1>();

        var (version, payload) = await FetchVerified();
        version.ShouldBe(announced.Version);
        payload.GetProperty("offers").EnumerateArray().ShouldContain(o => o.GetProperty("id").GetString() == "axis-amazon-5");
        payload.GetProperty("templates")[0].GetProperty("sender_patterns").GetArrayLength().ShouldBe(2);

        using var again = new HttpRequestMessage(HttpMethod.Get, $"/v1/catalog?since={version}");
        (await _client.SendAsync(again, Ct)).StatusCode.ShouldBe(HttpStatusCode.NotModified, "an app that has this version downloads nothing");

        var unchanged = await Publish();
        unchanged.Sent.MessagesOf<CatalogPublishedV1>().ShouldBeEmpty("nothing changed, so no new version");
    }

    [Fact]
    public async Task An_expired_offer_leaves_the_catalog_at_the_next_publish()
    {
        var today = DateOnly.FromDateTime(IndiaTime.ToIst(DateTimeOffset.UtcNow).DateTime);
        await Curate(HttpMethod.Put, "/internal/catalog/offers/short-lived",
            CatalogRulesTests.Offer("short-lived", from: today.AddDays(-1), to: today.AddDays(2)));
        await Publish();
        (await FetchVerified()).Payload.GetProperty("offers").EnumerateArray().ShouldContain(o => o.GetProperty("id").GetString() == "short-lived");

        host.Clock.Offset = TimeSpan.FromDays(5);
        try
        {
            await Publish();
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
        (await FetchVerified()).Payload.GetProperty("offers").EnumerateArray().ShouldNotContain(o => o.GetProperty("id").GetString() == "short-lived");
    }

    [Fact]
    public async Task Curation_needs_the_internal_key_and_valid_content()
    {
        (await Curate(HttpMethod.Post, "/internal/catalog/publish", key: null)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Curate(HttpMethod.Put, "/internal/catalog/offers/x", CatalogRulesTests.Offer("x", source: "http://plain.example"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Curate(HttpMethod.Put, "/internal/catalog/offers/x", CatalogRulesTests.Offer("y"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest, "path and body ids must match");
    }

    public void Dispose() => _client.Dispose();
}
