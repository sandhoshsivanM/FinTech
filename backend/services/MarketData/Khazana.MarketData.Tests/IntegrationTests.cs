using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Khazana.MarketData.Application.Ingest;
using Khazana.MarketData.Application.Persistence;
using Khazana.Messaging.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.MarketData.Tests;

/// <summary>
/// The real service against a real Postgres and a real RabbitMQ in Docker —
/// the same images the platform runs. Nothing is mocked except the NAV source,
/// which reads the shared fixture instead of downloading from AMFI.
/// </summary>
public sealed class MarketDataHost : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());

        // Program reads its connection strings before the host is built, so
        // they are supplied the way the platform supplies them: environment.
        Environment.SetEnvironmentVariable("ConnectionStrings__marketdata", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Environment.SetEnvironmentVariable("Providers__Nav", "Fixture");
        Environment.SetEnvironmentVariable("Providers__NavFixturePath",
            Path.Combine(AppContext.BaseDirectory, "Fixtures", "navall_sample.txt"));
        Environment.SetEnvironmentVariable("Database__MigrateOnStartup", "true");
        Environment.SetEnvironmentVariable("Market__Scheduler__Enabled", "false");

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            // A stand-in consumer, so the event must make the real trip:
            // outbox -> RabbitMQ exchange -> queue -> handler.
            .ConfigureServices(s => s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(PricesPublishedProbe)))));
        _ = Factory.Server; // start the host (runs migrations) before any test
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}

/// <summary>
/// The first consumer of <see cref="PricesPublishedV1"/>: proves the contract
/// arrives over RabbitMQ and deserialises. Real consumers (Notification) come
/// in later slices.
/// </summary>
public static class PricesPublishedProbe
{
    public static void Handle(PricesPublishedV1 message) => ArgumentNullException.ThrowIfNull(message);
}

[CollectionDefinition(nameof(MarketDataTestGroup))]
public sealed class MarketDataTestGroup : ICollectionFixture<MarketDataHost>;

[Collection(nameof(MarketDataTestGroup))]
public sealed class IngestAndServeTests(MarketDataHost host)
{
    private IHost Host => host.Factory.Services.GetRequiredService<IHost>();

    [Fact]
    public async Task Ingest_stores_the_day_publishes_one_event_and_serves_the_file()
    {
        // 1. First ingest: rows and file stored, event published to RabbitMQ.
        var first = await Host.TrackActivity()
            .IncludeExternalTransports()
            .Timeout(TimeSpan.FromSeconds(60))
            .InvokeMessageAndWaitAsync(new IngestNav());

        var published = first.Sent.SingleMessage<PricesPublishedV1>();
        first.Received.SingleMessage<PricesPublishedV1>().ShouldBe(published, "the event arrived through RabbitMQ intact");
        published.Date.ShouldBe(new DateOnly(2026, 10, 17));
        published.RowCount.ShouldBe(5);
        published.Kind.ShouldBe("nav");

        await using (var scope = host.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MarketDataDbContext>();
            (await db.NavQuotes.CountAsync(TestContext.Current.CancellationToken)).ShouldBe(5);
            (await db.NavFiles.SingleAsync(TestContext.Current.CancellationToken)).Sha256.ShouldBe(published.Sha256);
        }

        // 2. The latest file, gzip, with the content hash as its ETag.
        using var client = host.Factory.CreateClient();
        using var response = await client.GetAsync(new Uri("/v1/market/nav/latest", UriKind.Relative), TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.ETag!.Tag.ShouldBe($"\"{published.Sha256}\"");
        response.Content.Headers.ContentEncoding.ShouldContain("gzip");

        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        await using var gzip = new GZipStream(new MemoryStream(bytes), CompressionMode.Decompress);
        using var doc = await JsonDocument.ParseAsync(gzip, cancellationToken: TestContext.Current.CancellationToken);
        doc.RootElement.GetArrayLength().ShouldBe(5);

        // 3. A device that already has it downloads nothing.
        using var revalidate = new HttpRequestMessage(HttpMethod.Get, "/v1/market/nav/latest");
        revalidate.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{published.Sha256}\""));
        using var notModified = await client.SendAsync(revalidate, TestContext.Current.CancellationToken);
        notModified.StatusCode.ShouldBe(HttpStatusCode.NotModified);

        // 4. A dated file is immutable and cacheable for a year.
        using var dated = await client.GetAsync(new Uri("/v1/market/nav/2026-10-17", UriKind.Relative), TestContext.Current.CancellationToken);
        dated.StatusCode.ShouldBe(HttpStatusCode.OK);
        dated.Headers.CacheControl!.ToString().ShouldContain("immutable");

        // 5. Re-ingesting unchanged data refreshes rows but announces nothing.
        var second = await Host.TrackActivity()
            .IncludeExternalTransports()
            .Timeout(TimeSpan.FromSeconds(60))
            .InvokeMessageAndWaitAsync(new IngestNav());
        second.Sent.MessagesOf<PricesPublishedV1>().ShouldBeEmpty();
    }

    [Theory]
    [InlineData("2026-1-5")]
    [InlineData("17-10-2026")]
    [InlineData("2026-10-17T00:00:00")]
    [InlineData("not-a-date")]
    public async Task A_malformed_date_is_a_400(string date)
    {
        using var client = host.Factory.CreateClient();
        using var response = await client.GetAsync(new Uri($"/v1/market/nav/{date}", UriKind.Relative), TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_day_with_no_file_is_a_404()
    {
        using var client = host.Factory.CreateClient();
        using var response = await client.GetAsync(new Uri("/v1/market/nav/1999-01-01", UriKind.Relative), TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
