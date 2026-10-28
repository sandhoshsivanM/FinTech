using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Application.Persistence;
using Khazana.AccountAggregator.Domain;
using Khazana.AccountAggregator.Infrastructure;
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
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.AccountAggregator.Tests;

public sealed class TestClock : IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

/// <summary>The sample provider, with failures the tests can queue up and calls they can count.</summary>
public sealed class ScriptedProvider(FakeBankDataProvider inner) : IBankDataProvider
{
    public ConcurrentQueue<BankDataProviderException> FetchFailures { get; } = new();
    public ConcurrentBag<string> Revoked { get; } = [];
    private int _fetches;

    public int Fetches => Volatile.Read(ref _fetches);

    public string Name => inner.Name;

    public Task<ConsentCreated> CreateConsentAsync(ConsentRequest request, CancellationToken ct) => inner.CreateConsentAsync(request, ct);

    public Task<ConsentStatus> GetConsentStatusAsync(string consentHandle, CancellationToken ct) => inner.GetConsentStatusAsync(consentHandle, ct);

    public async Task RevokeConsentAsync(string consentHandle, CancellationToken ct)
    {
        await inner.RevokeConsentAsync(consentHandle, ct);
        Revoked.Add(consentHandle);
    }

    public Task<FiRequestStarted> RequestFiDataAsync(string consentHandle, DateOnly dataFrom, DateOnly dataTo, CancellationToken ct) =>
        inner.RequestFiDataAsync(consentHandle, dataFrom, dataTo, ct);

    public Task<FiFetchResult> FetchFiDataAsync(FiFetchContext context, CancellationToken ct)
    {
        Interlocked.Increment(ref _fetches);
        return FetchFailures.TryDequeue(out var failure) ? throw failure : inner.FetchFiDataAsync(context, ct);
    }

    /// <summary>True: act like a partner whose callbacks are unsigned hints (Setu), returning no status.</summary>
    public bool Hints { get; set; }

    public AaCallback? VerifyCallback(byte[] body, Func<string, string?> header, DateTimeOffset now)
    {
        if (!Hints) return inner.VerifyCallback(body, header, now);
        using var doc = JsonDocument.Parse(body);
        return new AaCallback(AaCallbackKind.ConsentStatus, doc.RootElement.GetProperty("consent_handle").GetString()!, null, null);
    }
}

public sealed class AaHost : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public TestTokenIssuer Issuer { get; } = new();
    public TestClock Clock { get; } = new();
    public ScriptedProvider Provider { get; } = new(new FakeBankDataProvider(new FakeAaOptions()));
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__aa", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        // The tests drive maintenance themselves, at chosen times.
        Environment.SetEnvironmentVariable("Aa__Sweeper__Enabled", "false");
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IConfigurationManager<OpenIdConnectConfiguration>>();
                s.AddSingleton(Issuer.Keys);
                s.RemoveAll<IClock>();
                s.AddSingleton<IClock>(Clock);
                s.RemoveAll<IBankDataProvider>();
                s.AddSingleton<IBankDataProvider>(Provider);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(AaEventProbe)));
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

/// <summary>Listens for the AA's own events, so the tests see them come back over RabbitMQ.</summary>
public static class AaEventProbe
{
    public static void Handle(ConsentActivatedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(ConsentRevokedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(PayloadSealedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(AaFetchFailedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(UserDataPurgedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(AaTestGroup))]
public sealed class AaTestGroup : ICollectionFixture<AaHost>;

/// <summary>The user's app: a device key for DPoP and a delivery key pair for opening payloads.</summary>
public sealed class App(AaHost host, Guid? userId = null) : IDisposable
{
    public static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _client = host.Factory.CreateClient();
    private readonly DeviceKey _key = new();
    public Guid UserId { get; } = userId ?? Guid.CreateVersion7();
    public Guid DeviceId { get; } = Guid.CreateVersion7();
    public (byte[] Public, byte[] Private) Delivery { get; } = DeliveryBox.CreateKeyPair();

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
        var text = await response.Content.ReadAsStringAsync();
        response.StatusCode.ShouldBe(expected, text);
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    public object ConsentBody(string[]? fiTypes = null, int? validityDays = null) => new
    {
        fi_types = fiTypes ?? [FiTypes.Deposit, FiTypes.MutualFunds, FiTypes.Epf, FiTypes.Insurance],
        delivery_key = Delivery.Public,
        validity_days = validityDays,
    };

    public async Task<Guid> CreateConsent(string[]? fiTypes = null, int? validityDays = null)
    {
        var created = await Ok(HttpMethod.Post, "/v1/aa/consents", ConsentBody(fiTypes, validityDays), HttpStatusCode.Created);
        created.GetProperty("status").GetString().ShouldBe("pending");
        created.GetProperty("redirect_url").GetString().ShouldNotBeNullOrEmpty();
        return created.GetProperty("id").GetGuid();
    }

    public async Task<JsonElement[]> Inbox() =>
        [.. (await Ok(HttpMethod.Get, "/v1/aa/inbox")).EnumerateArray()];

    public FiBundle Open(JsonElement item) => SealedEnvelope.Open<FiBundle>(
        item.GetProperty("sealed_payload").GetBytesFromBase64(), Delivery.Public, Delivery.Private,
        item.GetProperty("id").GetGuid(), item.GetProperty("kind").GetString()!);

    public void Dispose()
    {
        _client.Dispose();
        _key.Dispose();
    }
}

[Collection(nameof(AaTestGroup))]
public sealed class ConsentFlowTests(AaHost host)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Runs an action and waits for every message it causes, here and over RabbitMQ.</summary>
    private Task<ITrackedSession> Tracked(Func<Task> action) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(_ => action()));

    /// <summary>Creates a consent and approves it (the sample AA approves on the first status check); the first fetch runs.</summary>
    private async Task<(Guid Consent, ITrackedSession Session)> ActiveConsent(App app, string[]? fiTypes = null, int? validityDays = null)
    {
        var id = await app.CreateConsent(fiTypes, validityDays);
        var session = await Tracked(async () =>
            (await app.Ok(HttpMethod.Get, $"/v1/aa/consents/{id}")).GetProperty("status").GetString().ShouldBe("active"));
        return (id, session);
    }

    private Task<ITrackedSession> Invoke(object message) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60)).InvokeMessageAndWaitAsync(message);

    private Task<ITrackedSession> Publish(object message) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60)).PublishMessageAndWaitAsync(message);

    private static async Task<AaDbContext> Db(AsyncServiceScope scope) =>
        await Task.FromResult(scope.ServiceProvider.GetRequiredService<AaDbContext>());

    [Fact]
    public async Task Approval_runs_the_first_fetch_and_the_sealed_payload_opens_only_on_the_users_device()
    {
        using var app = new App(host);
        var (consent, session) = await ActiveConsent(app);

        session.Received.SingleMessage<ConsentActivatedV1>().ConsentId.ShouldBe(consent);
        var sealedEvent = session.Received.SingleMessage<PayloadSealedV1>();
        sealedEvent.UserId.ShouldBe(app.UserId);
        sealedEvent.Kind.ShouldBe(FiBundle.Kind);

        var item = (await app.Inbox()).ShouldHaveSingleItem();
        item.GetProperty("id").GetGuid().ShouldBe(sealedEvent.PayloadId);
        item.GetProperty("alg").GetString().ShouldBe(DeliveryBox.Alg);
        var bundle = app.Open(item);
        bundle.ConsentId.ShouldBe(consent);
        bundle.Deposits.ShouldNotBeEmpty();
        bundle.MutualFunds.ShouldNotBeEmpty();
        bundle.Retirement.ShouldHaveSingleItem().Kind.ShouldBe("EPF");
        bundle.Insurance.ShouldNotBeEmpty();
        bundle.Equities.ShouldBeEmpty("not consented");

        // The server's copy is ciphertext: no account number, narration or amount in it.
        await using (var scope = host.Factory.Services.CreateAsyncScope())
        {
            var stored = await (await Db(scope)).InboxPayloads.SingleAsync(p => p.UserId == app.UserId, Ct);
            var raw = Encoding.UTF8.GetString(stored.SealedPayload);
            raw.ShouldNotContain(bundle.Deposits[0].MaskedAccountNumber);
            raw.ShouldNotContain("SALARY");
            Should.Throw<System.Security.Cryptography.CryptographicException>(() =>
                DeliveryBox.Open(stored.SealedPayload, DeliveryBox.CreateKeyPair().PublicKey, DeliveryBox.CreateKeyPair().PrivateKey));
        }

        var listed = (await app.Ok(HttpMethod.Get, "/v1/aa/consents")).EnumerateArray().Single();
        listed.GetProperty("last_fetched_at").ValueKind.ShouldBe(JsonValueKind.String);
        listed.GetProperty("redirect_url").ValueKind.ShouldBe(JsonValueKind.Null, "only a pending consent needs the approval link");

        await app.Ok(HttpMethod.Post, $"/v1/aa/inbox/{sealedEvent.PayloadId}/ack", expected: HttpStatusCode.NoContent);
        (await app.Inbox()).ShouldBeEmpty("ack deletes the payload");
        await using (var scope = host.Factory.Services.CreateAsyncScope())
            (await (await Db(scope)).FetchSagas.SingleAsync(s => s.ConsentId == consent, Ct)).State.ShouldBe(FetchState.Delivered);
        await app.Ok(HttpMethod.Post, $"/v1/aa/inbox/{sealedEvent.PayloadId}/ack", expected: HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task No_fetch_without_an_active_unexpired_consent_of_ones_own()
    {
        using var app = new App(host);
        using var stranger = new App(host);
        var pending = await app.CreateConsent();
        var before = host.Provider.Fetches;

        (await app.Send(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = pending })).StatusCode.ShouldBe(HttpStatusCode.Conflict, "pending");

        var (active, _) = await ActiveConsent(app, validityDays: 1);
        (await stranger.Send(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = active })).StatusCode
            .ShouldBe(HttpStatusCode.NotFound, "another user's consent doesn't exist for them");
        (await stranger.Send(HttpMethod.Get, $"/v1/aa/consents/{active}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.Inbox()).ShouldBeEmpty();

        host.Clock.Offset = TimeSpan.FromDays(2);
        try
        {
            using var expiredFetch = await app.Send(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = active });
            expiredFetch.StatusCode.ShouldBe(HttpStatusCode.Conflict, "expired, even before the sweeper marks it");
            (await expiredFetch.Content.ReadAsStringAsync(Ct)).ShouldContain("consent_inactive");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }

        await app.Ok(HttpMethod.Delete, $"/v1/aa/consents/{active}", expected: HttpStatusCode.NoContent);
        (await app.Send(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = active })).StatusCode.ShouldBe(HttpStatusCode.Conflict, "revoked");
        host.Provider.Fetches.ShouldBe(before + 1, "only the approval's own first fetch reached the provider");
    }

    [Fact]
    public async Task A_saga_step_rechecks_the_consent_so_a_revocation_mid_fetch_collects_nothing()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);
        await app.Ok(HttpMethod.Post, $"/v1/aa/inbox/{(await app.Inbox())[0].GetProperty("id").GetGuid()}/ack", expected: HttpStatusCode.NoContent);

        // A saga caught between request and collection when the consent ends.
        Guid sagaId;
        await using (var scope = host.Factory.Services.CreateAsyncScope())
        {
            var db = await Db(scope);
            sagaId = Guid.CreateVersion7();
            db.FetchSagas.Add(new FetchSagaRow
            {
                Id = sagaId, ConsentId = consent, UserId = app.UserId, State = FetchState.Fetching, Trigger = "on_open",
                SessionId = "fake-session-x", DataFrom = new DateOnly(2026, 9, 1), DataTo = new DateOnly(2026, 9, 30),
                CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow, RequestedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(Ct);
            await db.Consents.Where(c => c.Id == consent).ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ConsentStatus.Paused), Ct);
        }
        var before = host.Provider.Fetches;
        var session = await Invoke(new CollectFiData(sagaId));

        host.Provider.Fetches.ShouldBe(before, "the provider is never asked");
        session.Received.SingleMessage<AaFetchFailedV1>().ErrorCode.ShouldBe("consent_inactive");
        (await app.Inbox()).ShouldBeEmpty();
    }

    [Fact]
    public async Task Revoking_deletes_every_payload_stops_fetches_and_tells_the_partner()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);
        (await app.Inbox()).Length.ShouldBe(1);
        var handle = await HandleOf(consent);

        var session = await Tracked(() => app.Ok(HttpMethod.Delete, $"/v1/aa/consents/{consent}", expected: HttpStatusCode.NoContent));

        session.Received.SingleMessage<ConsentRevokedV1>().Status.ShouldBe("revoked");
        (await app.Inbox()).ShouldBeEmpty();
        host.Provider.Revoked.ShouldContain(handle);
        (await app.Ok(HttpMethod.Get, $"/v1/aa/consents/{consent}")).GetProperty("status").GetString().ShouldBe("revoked");
        await app.Ok(HttpMethod.Delete, $"/v1/aa/consents/{consent}", expected: HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Fetch_now_joins_a_fresh_fetch_and_starts_one_only_when_the_last_is_over_a_day_old()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);

        var fresh = await app.Ok(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = consent }, HttpStatusCode.Accepted);
        fresh.GetProperty("started").GetBoolean().ShouldBeFalse();
        fresh.GetProperty("state").GetString().ShouldBe("fresh");

        await using (var scope = host.Factory.Services.CreateAsyncScope())
            await (await Db(scope)).Consents.Where(c => c.Id == consent)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.LastFetchedAt, DateTimeOffset.UtcNow.AddDays(-2)), Ct);

        JsonElement started = default;
        var session = await Tracked(async () =>
            started = await app.Ok(HttpMethod.Post, "/v1/aa/fetch", new { consent_id = consent }, HttpStatusCode.Accepted));
        started.GetProperty("started").GetBoolean().ShouldBeTrue();
        session.Received.SingleMessage<PayloadSealedV1>().UserId.ShouldBe(app.UserId);
        (await app.Ok(HttpMethod.Get, $"/v1/aa/fetch/{started.GetProperty("saga_id").GetGuid()}")).GetProperty("state").GetString().ShouldBe("sealed");
        (await app.Inbox()).Length.ShouldBe(2);
    }

    [Fact]
    public async Task Transient_partner_errors_are_retried_three_times_then_the_fetch_fails_and_is_audited()
    {
        using var app = new App(host);
        var consent = await app.CreateConsent();
        for (var i = 0; i < 3; i++) host.Provider.FetchFailures.Enqueue(new BankDataProviderException("provider_unavailable", true, "503"));

        await Tracked(async () => await app.Ok(HttpMethod.Get, $"/v1/aa/consents/{consent}"));
        var saga = await SagaOf(consent);
        saga.State.ShouldBe(FetchState.Fetching);
        saga.Attempt.ShouldBe(1);
        saga.NextRetryAt.ShouldNotBeNull();

        // The scheduled retries, run now instead of in one and five minutes.
        await Invoke(new CollectFiData(saga.Id));
        (await SagaOf(consent)).Attempt.ShouldBe(2);
        var session = await Invoke(new CollectFiData(saga.Id));

        var failed = await SagaOf(consent);
        failed.State.ShouldBe(FetchState.Failed);
        failed.ErrorCode.ShouldBe("provider_unavailable");
        session.Received.SingleMessage<AaFetchFailedV1>().ConsentId.ShouldBe(consent);
        (await app.Inbox()).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_decrypt_error_fails_at_once_with_no_retry_storm()
    {
        using var app = new App(host);
        var consent = await app.CreateConsent();
        host.Provider.FetchFailures.Enqueue(new BankDataProviderException("decrypt_failed", false, "bad FI payload"));
        var session = await Tracked(async () => await app.Ok(HttpMethod.Get, $"/v1/aa/consents/{consent}"));
        var saga = await SagaOf(consent);
        saga.State.ShouldBe(FetchState.Failed);
        saga.Attempt.ShouldBe(1);
        session.Received.SingleMessage<AaFetchFailedV1>().ErrorCode.ShouldBe("decrypt_failed");
    }

    [Fact]
    public async Task Partner_callbacks_must_be_signed_and_a_revocation_at_the_AA_deletes_the_data()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);
        var handle = await HandleOf(consent);
        var body = Encoding.UTF8.GetBytes($$"""{"type":"consent_status","consent_handle":"{{handle}}","status":"REVOKED"}""");
        using var client = host.Factory.CreateClient();

        (await PostCallback(client, body, signature: new string('a', 64))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await PostCallback(client, body, at: DateTimeOffset.UtcNow.AddMinutes(-30))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized, "replayed late");
        (await app.Inbox()).Length.ShouldBe(1, "a refused callback changes nothing");

        var session = await Tracked(async () => (await PostCallback(client, body)).StatusCode.ShouldBe(HttpStatusCode.NoContent));
        session.Received.SingleMessage<ConsentRevokedV1>().ConsentId.ShouldBe(consent);
        (await app.Inbox()).ShouldBeEmpty();
        host.Provider.Revoked.ShouldNotContain(handle, "the AA told us; nothing to tell it back");

        var unknown = Encoding.UTF8.GetBytes("""{"type":"consent_status","consent_handle":"fake-nobody","status":"ACTIVE"}""");
        (await PostCallback(client, unknown)).StatusCode.ShouldBe(HttpStatusCode.NoContent, "an unknown handle reveals nothing");
    }

    [Fact]
    public async Task An_unsigned_hint_is_never_believed_the_status_is_read_back_from_the_partner()
    {
        using var app = new App(host);
        var consent = await app.CreateConsent();
        var handle = await HandleOf(consent);
        // The body claims a rejection; the partner's own API (the sample: approve on first check) says active.
        var body = Encoding.UTF8.GetBytes($$"""{"type":"consent_status","consent_handle":"{{handle}}","status":"REJECTED"}""");
        using var client = host.Factory.CreateClient();
        host.Provider.Hints = true;
        try
        {
            await Tracked(async () => (await PostCallback(client, body, signature: new string('0', 64))).StatusCode.ShouldBe(HttpStatusCode.NoContent));
        }
        finally
        {
            host.Provider.Hints = false;
        }
        await using var scope = host.Factory.Services.CreateAsyncScope();
        (await (await Db(scope)).Consents.SingleAsync(c => c.Id == consent, Ct)).Status.ShouldBe(ConsentStatus.Active);
    }

    [Fact]
    public async Task The_app_can_ask_which_partner_runs_and_each_consent_names_its_partner()
    {
        using var app = new App(host);
        var info = await app.Ok(HttpMethod.Get, "/v1/aa/provider");
        info.GetProperty("provider").GetString().ShouldBe("fake");
        info.GetProperty("needs_aa_handle").GetBoolean().ShouldBeFalse();
        info.GetProperty("fi_types").EnumerateArray().Select(e => e.GetString()).ShouldContain(FiTypes.Epf);
        var id = await app.CreateConsent([FiTypes.Deposit]);
        (await app.Ok(HttpMethod.Get, "/v1/aa/consents")).EnumerateArray().Single(c => c.GetProperty("id").GetGuid() == id)
            .GetProperty("provider").GetString().ShouldBe("fake");
        await app.Ok(HttpMethod.Post, "/v1/aa/consents", new { fi_types = new[] { FiTypes.Deposit }, delivery_key = app.Delivery.Public, aa_handle = "not a handle" },
            HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Maintenance_expires_consents_drops_uncollected_payloads_and_runs_scheduled_fetches()
    {
        using var expiring = new App(host);
        var (shortLived, _) = await ActiveConsent(expiring, validityDays: 3);
        using var forgetful = new App(host);
        var (weekly, _) = await ActiveConsent(forgetful);

        // Eight days on: the short consent has expired and the weekly one is due.
        // Its first payload is still uncollected, but only 8 of 14 days have passed.
        host.Clock.Offset = TimeSpan.FromDays(8);
        try
        {
            await forgetful.Ok(HttpMethod.Get, "/v1/aa/consents"); // the user opened the app
            var session = await Invoke(new RunAaMaintenance());
            session.Received.MessagesOf<ConsentRevokedV1>().ShouldContain(m => m.ConsentId == shortLived && m.Status == "expired");
            (await expiring.Inbox()).ShouldBeEmpty("an expired consent takes its payloads with it");
            session.Received.MessagesOf<PayloadSealedV1>().ShouldContain(m => m.UserId == forgetful.UserId, "the weekly fetch ran");
            (await forgetful.Inbox()).Length.ShouldBe(2);

            host.Clock.Offset = TimeSpan.FromDays(14.5);
            await Invoke(new RunAaMaintenance());
            (await forgetful.Inbox()).Length.ShouldBe(1, "the first payload passed 14 days uncollected");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
        (await SagaOf(weekly, first: true)).State.ShouldBe(FetchState.Expired);
    }

    [Fact]
    public async Task Scheduled_fetches_skip_users_inactive_for_30_days()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);
        await using (var scope = host.Factory.Services.CreateAsyncScope())
            await (await Db(scope)).Consents.Where(c => c.Id == consent).ExecuteUpdateAsync(s => s
                .SetProperty(c => c.OwnerSeenAt, DateTimeOffset.UtcNow.AddDays(-31))
                .SetProperty(c => c.NextFetchAt, DateTimeOffset.UtcNow.AddMinutes(-1)), Ct);
        var session = await Invoke(new RunAaMaintenance());
        session.Received.MessagesOf<PayloadSealedV1>().ShouldNotContain(m => m.UserId == app.UserId);
    }

    [Fact]
    public async Task Account_deletion_revokes_at_the_partner_and_purges_everything()
    {
        using var app = new App(host);
        var (consent, _) = await ActiveConsent(app);
        var handle = await HandleOf(consent);

        var session = await Publish(new AccountDeletionRequestedV1(app.UserId, DateTimeOffset.UtcNow.AddSeconds(-1)));

        session.Received.SingleMessage<UserDataPurgedV1>().Service.ShouldBe("aa");
        host.Provider.Revoked.ShouldContain(handle);
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = await Db(scope);
        (await db.Consents.AnyAsync(c => c.UserId == app.UserId, Ct)).ShouldBeFalse();
        (await db.FetchSagas.AnyAsync(s => s.UserId == app.UserId, Ct)).ShouldBeFalse();
        (await db.InboxPayloads.AnyAsync(p => p.UserId == app.UserId, Ct)).ShouldBeFalse();
    }

    [Fact]
    public async Task A_cancelled_deletion_purges_nothing()
    {
        using var app = new App(host);
        await ActiveConsent(app);
        var executeAfter = DateTimeOffset.UtcNow.AddSeconds(-1);
        await Publish(new AccountDeletionCancelledV1(app.UserId, executeAfter));
        var session = await Publish(new AccountDeletionRequestedV1(app.UserId, executeAfter));
        session.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        (await app.Inbox()).Length.ShouldBe(1);
    }

    private static readonly string[] Crypto = ["CRYPTO"];
    private static readonly string[] Deposit = ["DEPOSIT"];

    [Fact]
    public async Task Malformed_consent_requests_are_refused()
    {
        using var app = new App(host);
        (await app.Send(HttpMethod.Post, "/v1/aa/consents", new { fi_types = Crypto, delivery_key = app.Delivery.Public }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await app.Send(HttpMethod.Post, "/v1/aa/consents", new { fi_types = Deposit, delivery_key = new byte[32] }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest, "an all-zero delivery key");
        (await app.Send(HttpMethod.Post, "/v1/aa/consents", new { fi_types = Deposit, delivery_key = app.Delivery.Public, validity_days = 400 }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await app.Send(HttpMethod.Post, "/v1/aa/consents", new { fi_types = Deposit, delivery_key = app.Delivery.Public, pan = "ABCDE1234F" }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest, "unknown fields are rejected");
    }

    [Fact]
    public async Task Every_route_needs_a_DPoP_bound_token()
    {
        using var client = host.Factory.CreateClient();
        (await client.GetAsync("/v1/aa/consents", Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await client.GetAsync("/v1/aa/inbox", Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    private static async Task<HttpResponseMessage> PostCallback(HttpClient client, byte[] body, string? signature = null, DateTimeOffset? at = null)
    {
        var ts = (at ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/webhooks/aa") { Content = new ByteArrayContent(body) };
        request.Headers.Add(FakeBankDataProvider.TimestampHeader, ts.ToString(CultureInfo.InvariantCulture));
        request.Headers.Add(FakeBankDataProvider.SignatureHeader,
            signature ?? FakeBankDataProvider.SignCallback(FakeBankDataProvider.DevelopmentCallbackSecret, ts, body));
        return await client.SendAsync(request, Ct);
    }

    private async Task<string> HandleOf(Guid consent)
    {
        await using var scope = host.Factory.Services.CreateAsyncScope();
        return await (await Db(scope)).Consents.Where(c => c.Id == consent).Select(c => c.Handle).SingleAsync(Ct);
    }

    private async Task<FetchSagaRow> SagaOf(Guid consent, bool first = false)
    {
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var sagas = (await Db(scope)).FetchSagas.AsNoTracking().Where(s => s.ConsentId == consent);
        return first
            ? await sagas.OrderBy(s => s.CreatedAt).FirstAsync(Ct)
            : await sagas.OrderByDescending(s => s.CreatedAt).FirstAsync(Ct);
    }
}

public sealed class ProductionGuardTests
{
    [Fact]
    public void A_Production_host_configured_with_the_sample_AA_refuses_to_start()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Production")
            .UseSetting("ConnectionStrings:aa", "Host=127.0.0.1;Port=9;Database=none")
            .UseSetting("ConnectionStrings:rabbitmq", "amqp://127.0.0.1:9")
            .UseSetting("Providers:AccountAggregator", "Fake"));
        Should.Throw<InvalidOperationException>(() => factory.Server).Message.ShouldContain("not allowed in Production");
    }
}
