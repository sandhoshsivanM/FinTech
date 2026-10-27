using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Khazana.Credit.Application;
using Khazana.Credit.Application.Persistence;
using Khazana.Credit.Domain;
using Khazana.Credit.Infrastructure;
using Khazana.Crypto;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Khazana.TestKit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Npgsql;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.Credit.Tests;

public sealed class TestClock : IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

/// <summary>The sample bureau, plus a gate a test can hold shut to keep a pull in flight, and a call count.</summary>
public sealed class GatedProvider : ICreditReportProvider
{
    private readonly FakeCreditReportProvider _inner = new();
    private int _calls;

    public TaskCompletionSource? Gate { get; set; }

    public TaskCompletionSource? Entered { get; set; }

    public int Calls => Volatile.Read(ref _calls);

    public string Name => _inner.Name;

    public async Task<CreditReport> FetchReportAsync(CreditReportRequest request, CancellationToken ct)
    {
        Interlocked.Increment(ref _calls);
        Entered?.TrySetResult();
        if (Gate is { } gate) await gate.Task.WaitAsync(ct);
        return await _inner.FetchReportAsync(request, ct);
    }
}

public sealed class CreditHost : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public TestTokenIssuer Issuer { get; } = new();
    public TestClock Clock { get; } = new();
    public GatedProvider Provider { get; } = new();
    public string ConnectionString => _postgres.GetConnectionString();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__credit", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Environment.SetEnvironmentVariable("Credit__Sweeper__Enabled", "false");
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IConfigurationManager<OpenIdConnectConfiguration>>();
                s.AddSingleton(Issuer.Keys);
                s.RemoveAll<IClock>();
                s.AddSingleton<IClock>(Clock);
                s.RemoveAll<ICreditReportProvider>();
                s.AddSingleton<ICreditReportProvider>(Provider);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(CreditEventProbe)));
            }));
        _ = Factory.Server;
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        Issuer.Dispose();
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}

public static class CreditEventProbe
{
    public static void Handle(CreditReportReadyV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(CreditConsentWithdrawnV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(UserDataPurgedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(CreditTestGroup))]
public sealed class CreditTestGroup : ICollectionFixture<CreditHost>;

public sealed class CreditApp(CreditHost host) : IDisposable
{
    private static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _client = host.Factory.CreateClient();
    private readonly DeviceKey _key = new();
    public Guid UserId { get; } = Guid.CreateVersion7();
    public Guid DeviceId { get; } = Guid.CreateVersion7();
    public (byte[] Public, byte[] Private) Delivery { get; } = DeliveryBox.CreateKeyPair();

    /// <summary>A PAN of this user's own, so reports differ per test user.</summary>
    public string Pan { get; } = $"ABCP{(char)('A' + Random.Shared.Next(0, 25))}{Random.Shared.Next(1000, 9999)}F";

    public object PullBody(string? pan = null, bool accepted = true, string version = CreditSettings.DefaultVersion) => new
    {
        consent_text_version = version,
        consent_accepted = accepted,
        pan = pan ?? Pan,
        mobile = "9876543210",
        delivery_key = Delivery.Public,
    };

    public async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body = null)
    {
        var token = host.Issuer.Mint(UserId, DeviceId, _key);
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", token);
        request.Headers.Add("DPoP", _key.Proof(method.Method, "http://localhost" + path.Split('?')[0], token));
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body, Snake), Encoding.UTF8, "application/json");
        return await _client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    public async Task<JsonElement> Ok(HttpMethod method, string path, object? body = null, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var response = await Send(method, path, body);
        var text = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(expected, text);
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    public async Task<JsonElement[]> Inbox() => [.. (await Ok(HttpMethod.Get, "/v1/credit/inbox")).EnumerateArray()];

    public void Dispose()
    {
        _client.Dispose();
        _key.Dispose();
    }
}

[Collection(nameof(CreditTestGroup))]
public sealed class CreditFlowTests(CreditHost host)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private Task<ITrackedSession> Tracked(Func<Task> action) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(_ => action()));

    private Task<ITrackedSession> Publish(object message) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60)).PublishMessageAndWaitAsync(message);

    [Fact]
    public async Task A_consented_pull_is_sealed_to_the_user_and_the_server_keeps_only_that_it_happened()
    {
        using var app = new CreditApp(host);
        JsonElement pulled = default;
        var session = await Tracked(async () =>
            pulled = await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created));

        var ready = session.Received.SingleMessage<CreditReportReadyV1>();
        ready.UserId.ShouldBe(app.UserId);
        ready.PayloadId.ShouldBe(pulled.GetProperty("payload_id").GetGuid());
        pulled.GetProperty("status").GetString().ShouldBe("succeeded");

        var item = (await app.Inbox()).ShouldHaveSingleItem();
        item.GetProperty("alg").GetString().ShouldBe(DeliveryBox.Alg);
        var report = SealedEnvelope.Open<CreditReport>(item.GetProperty("sealed_payload").GetBytesFromBase64(),
            app.Delivery.Public, app.Delivery.Private, ready.PayloadId, CreditReport.Kind);
        report.Score.Value.ShouldBeInRange(300, 900);
        report.Accounts.ShouldNotBeEmpty();
        report.Sample.ShouldBeTrue();

        // Nothing readable at rest: not the PAN, not the mobile, not the score.
        await using (var connection = new NpgsqlConnection(host.ConnectionString))
        {
            await connection.OpenAsync(Ct);
            await using var dump = new NpgsqlCommand(
                "SELECT coalesce(string_agg(t::text, '|'), '') FROM (SELECT * FROM credit.credit_pulls) t", connection);
            var pulls = (string)(await dump.ExecuteScalarAsync(Ct))!;
            pulls.ShouldNotContain(app.Pan);
            pulls.ShouldNotContain("9876543210");
            pulls.ShouldContain(CreditSettings.DefaultVersion, customMessage: "the consent text version is kept");
            await using var sealedDump = new NpgsqlCommand(
                $"SELECT encode(sealed_payload, 'escape') FROM credit.inbox_payloads WHERE id = '{ready.PayloadId}'", connection);
            var raw = (string)(await sealedDump.ExecuteScalarAsync(Ct))!;
            raw.ShouldNotContain("CREDIT_CARD");
            raw.ShouldNotContain(report.Accounts[0].MaskedNumber);
        }

        var history = await app.Ok(HttpMethod.Get, "/v1/credit/pulls");
        history.GetProperty("pulls").EnumerateArray().Single().GetProperty("payload_id").GetGuid().ShouldBe(ready.PayloadId);
        history.GetProperty("next_allowed_at").GetDateTimeOffset().ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddDays(29));

        await app.Ok(HttpMethod.Post, $"/v1/credit/inbox/{ready.PayloadId}/ack", expected: HttpStatusCode.NoContent);
        (await app.Inbox()).ShouldBeEmpty();
        await app.Ok(HttpMethod.Post, $"/v1/credit/inbox/{ready.PayloadId}/ack", expected: HttpStatusCode.NotFound);
    }

    [Theory]
    [InlineData(false, CreditSettings.DefaultVersion)]
    [InlineData(true, "credit-consent-v0")]
    public async Task No_pull_without_explicit_consent_to_a_current_text(bool accepted, string version)
    {
        using var app = new CreditApp(host);
        var before = host.Provider.Calls;
        using var response = await app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody(accepted: accepted, version: version));
        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await response.Content.ReadAsStringAsync(Ct)).ShouldContain("consent_required");
        host.Provider.Calls.ShouldBe(before, "the bureau is never called");
    }

    [Fact]
    public async Task One_pull_per_30_days_and_a_failed_pull_does_not_count()
    {
        using var app = new CreditApp(host);
        (await app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody(pan: "ABCPE1234Z"))).StatusCode
            .ShouldBe(HttpStatusCode.BadGateway, "the sample bureau has no record");
        await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);

        using var again = await app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody());
        again.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        (await again.Content.ReadAsStringAsync(Ct)).ShouldContain("next_allowed_at");

        host.Clock.Offset = TimeSpan.FromDays(31);
        try
        {
            await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
        var pulls = (await app.Ok(HttpMethod.Get, "/v1/credit/pulls")).GetProperty("pulls").EnumerateArray()
            .Select(p => p.GetProperty("status").GetString()).ToList();
        pulls.ShouldBe(["succeeded", "succeeded", "failed"]);
    }

    [Fact]
    public async Task Two_pulls_at_once_buy_one_report()
    {
        using var app = new CreditApp(host);
        host.Provider.Entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        host.Provider.Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            var first = app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody());
            await host.Provider.Entered.Task.WaitAsync(TimeSpan.FromSeconds(30), Ct);
            using var second = await app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody());
            second.StatusCode.ShouldBe(HttpStatusCode.Conflict);
            host.Provider.Gate.SetResult();
            using var firstResponse = await first;
            firstResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        }
        finally
        {
            host.Provider.Gate.TrySetResult();
            host.Provider.Gate = null;
            host.Provider.Entered = null;
        }
    }

    [Fact]
    public async Task Malformed_pulls_are_refused_before_the_bureau_is_called()
    {
        using var app = new CreditApp(host);
        var before = host.Provider.Calls;
        (await app.Send(HttpMethod.Post, "/v1/credit/report", app.PullBody(pan: "NOTAPAN"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await app.Send(HttpMethod.Post, "/v1/credit/report", new
        {
            consent_text_version = CreditSettings.DefaultVersion, consent_accepted = true, pan = app.Pan, mobile = "9876543210", delivery_key = new byte[32],
        })).StatusCode.ShouldBe(HttpStatusCode.BadRequest, "all-zero delivery key");
        host.Provider.Calls.ShouldBe(before);
    }

    [Fact]
    public async Task Withdrawing_consent_deletes_undelivered_reports()
    {
        using var app = new CreditApp(host);
        await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        (await app.Inbox()).Length.ShouldBe(1);
        var session = await Tracked(() => app.Ok(HttpMethod.Delete, "/v1/credit/consent", expected: HttpStatusCode.NoContent));
        session.Received.SingleMessage<CreditConsentWithdrawnV1>().UserId.ShouldBe(app.UserId);
        (await app.Inbox()).ShouldBeEmpty();
    }

    [Fact]
    public async Task Maintenance_drops_uncollected_reports_after_14_days_and_frees_stuck_pulls()
    {
        using var app = new CreditApp(host);
        await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        await using (var scope = host.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CreditDbContext>();
            db.Pulls.Add(new CreditPullRow
            {
                Id = Guid.CreateVersion7(), UserId = Guid.CreateVersion7(), Provider = "fake", Status = PullStatus.InProgress,
                ConsentTextVersion = CreditSettings.DefaultVersion, Purpose = CreditRules.Purpose,
                RequestedAt = DateTimeOffset.UtcNow.AddHours(-1), CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(Ct);
        }

        host.Clock.Offset = TimeSpan.FromDays(15);
        try
        {
            await host.Host.InvokeMessageAndWaitAsync(new RunCreditMaintenance());
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
        (await app.Inbox()).ShouldBeEmpty();
        await using (var scope = host.Factory.Services.CreateAsyncScope())
            (await scope.ServiceProvider.GetRequiredService<CreditDbContext>().Pulls.AnyAsync(p => p.Status == PullStatus.InProgress, Ct)).ShouldBeFalse();
    }

    [Fact]
    public async Task Account_deletion_purges_pull_records_and_reports()
    {
        using var app = new CreditApp(host);
        await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        var session = await Publish(new AccountDeletionRequestedV1(app.UserId, DateTimeOffset.UtcNow.AddSeconds(-1)));
        session.Received.SingleMessage<UserDataPurgedV1>().Service.ShouldBe("credit");
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CreditDbContext>();
        (await db.Pulls.AnyAsync(p => p.UserId == app.UserId, Ct)).ShouldBeFalse();
        (await db.InboxPayloads.AnyAsync(p => p.UserId == app.UserId, Ct)).ShouldBeFalse();
    }

    [Fact]
    public async Task A_cancelled_deletion_purges_nothing()
    {
        using var app = new CreditApp(host);
        await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        var executeAfter = DateTimeOffset.UtcNow.AddSeconds(-1);
        await Publish(new AccountDeletionCancelledV1(app.UserId, executeAfter));
        var session = await Publish(new AccountDeletionRequestedV1(app.UserId, executeAfter));
        session.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        (await app.Inbox()).Length.ShouldBe(1);
    }

    [Fact]
    public async Task Another_users_reports_are_invisible()
    {
        using var app = new CreditApp(host);
        using var stranger = new CreditApp(host);
        var pulled = await app.Ok(HttpMethod.Post, "/v1/credit/report", app.PullBody(), HttpStatusCode.Created);
        (await stranger.Inbox()).ShouldBeEmpty();
        await stranger.Ok(HttpMethod.Post, $"/v1/credit/inbox/{pulled.GetProperty("payload_id").GetGuid()}/ack", expected: HttpStatusCode.NotFound);
        (await app.Inbox()).Length.ShouldBe(1);
    }

    [Fact]
    public async Task Every_route_needs_a_DPoP_bound_token()
    {
        using var client = host.Factory.CreateClient();
        (await client.GetAsync("/v1/credit/inbox", Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await client.PostAsync("/v1/credit/report", null, Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }
}

public sealed class CreditProductionGuardTests
{
    [Fact]
    public void A_Production_host_configured_with_the_sample_bureau_refuses_to_start()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Production")
            .UseSetting("ConnectionStrings:credit", "Host=127.0.0.1;Port=9;Database=none")
            .UseSetting("ConnectionStrings:rabbitmq", "amqp://127.0.0.1:9")
            .UseSetting("Providers:Credit", "Fake"));
        Should.Throw<InvalidOperationException>(() => factory.Server).Message.ShouldContain("not allowed in Production");
    }
}
