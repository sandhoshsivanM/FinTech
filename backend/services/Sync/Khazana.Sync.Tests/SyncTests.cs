using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Khazana.Sync.Application;
using Khazana.Sync.Application.Persistence;
using Khazana.Sync.Domain;
using Khazana.Sync.Infrastructure;
using Khazana.TestKit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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

namespace Khazana.Sync.Tests;

public sealed class TestClock : IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

public sealed class SyncHost : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public TestTokenIssuer Issuer { get; } = new();
    public TestClock Clock { get; } = new();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__sync", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        // The sweeper stays on: it once crashed the host by publishing before Wolverine
        // had started, which only a host with the sweeper enabled can catch.
        Environment.SetEnvironmentVariable("Sync__Sweeper__Enabled", "true");
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IConfigurationManager<OpenIdConnectConfiguration>>();
                s.AddSingleton(Issuer.Keys);
                s.RemoveAll<IClock>();
                s.AddSingleton<IClock>(Clock);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(SyncEventProbe)));
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

public static class SyncEventProbe
{
    public static void Handle(RecordsPushedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(UserDataPurgedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(SyncTestGroup))]
public sealed class SyncTestGroup : ICollectionFixture<SyncHost>;

/// <summary>A device with a session; pushes and pulls opaque ciphertext.</summary>
public sealed class Device(SyncHost host, Guid userId, WebApplicationFactory<Program>? factory = null) : IDisposable
{
    private static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _client = (factory ?? host.Factory).CreateClient();
    private readonly DeviceKey _key = new();
    public Guid UserId { get; } = userId;
    public Guid DeviceId { get; } = Guid.CreateVersion7();

    public static object Record(string id, DateTimeOffset updated, byte[]? ciphertext = null, bool deleted = false, string collection = "transactions") =>
        new { record_id = id, collection, client_updated_at = updated, deleted, ciphertext = ciphertext ?? RandomNumberGenerator.GetBytes(64), key_version = 1 };

    public async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body = null)
    {
        var token = host.Issuer.Mint(UserId, DeviceId, _key);
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", token);
        var target = "http://localhost" + path.Split('?')[0];
        request.Headers.Add("DPoP", _key.Proof(method.Method, target, token));
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body, Snake), Encoding.UTF8, "application/json");
        return await _client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    public async Task<HttpResponseMessage> SendBytes(HttpMethod method, string path, byte[] body)
    {
        var token = host.Issuer.Mint(UserId, DeviceId, _key);
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", token);
        request.Headers.Add("DPoP", _key.Proof(method.Method, "http://localhost" + path.Split('?')[0], token));
        request.Content = new ByteArrayContent(body);
        return await _client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    public Task<HttpResponseMessage> Push(params object[] records) => Send(HttpMethod.Post, "/v1/sync/push", new { records });

    public async Task<JsonElement> PushOk(params object[] records)
    {
        var response = await Push(records);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    public async Task<JsonElement> Pull(long since = 0, int limit = 500, long epoch = 0)
    {
        var response = await Send(HttpMethod.Get, $"/v1/sync/pull?since={since}&limit={limit}&epoch={epoch}");
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    public void Dispose()
    {
        _client.Dispose();
        _key.Dispose();
    }
}

[Collection(nameof(SyncTestGroup))]
public sealed class SyncFlowTests(SyncHost host)
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.UtcNow.AddHours(-1);

    [Fact]
    public async Task A_push_is_stored_as_is_announced_over_RabbitMQ_and_pulled_by_the_other_device()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Device(host, user);
        using var laptop = new Device(host, user);
        var secret = RandomNumberGenerator.GetBytes(120);

        JsonElement pushed = default;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                pushed = await phone.PushOk(Device.Record("txn-1", T0, secret), Device.Record("txn-2", T0))));

        pushed.GetProperty("accepted").GetInt32().ShouldBe(2);
        var announced = tracked.Received.SingleMessage<RecordsPushedV1>();
        announced.UserId.ShouldBe(user);
        announced.FromDeviceId.ShouldBe(phone.DeviceId);
        announced.Seq.ShouldBe(pushed.GetProperty("last_seq").GetInt64());

        var page = await laptop.Pull();
        var records = page.GetProperty("records").EnumerateArray().ToList();
        records.Select(r => r.GetProperty("record_id").GetString()).ShouldBe(["txn-1", "txn-2"]);
        records[0].GetProperty("ciphertext").GetBytesFromBase64().ShouldBe(secret, "the server returns exactly what it was given");
        records[0].GetProperty("seq").GetInt64().ShouldBeLessThan(records[1].GetProperty("seq").GetInt64());

        var cursor = page.GetProperty("last_seq").GetInt64();
        await phone.PushOk(Device.Record("txn-3", T0));
        var next = await laptop.Pull(cursor);
        next.GetProperty("records").EnumerateArray().Select(r => r.GetProperty("record_id").GetString()).ShouldBe(["txn-3"]);
    }

    [Fact]
    public async Task An_older_version_never_replaces_a_newer_one()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Device(host, user);
        using var tablet = new Device(host, user);
        var newer = RandomNumberGenerator.GetBytes(64);
        await phone.PushOk(Device.Record("budget-1", T0.AddMinutes(10), newer));

        var result = await tablet.PushOk(Device.Record("budget-1", T0, RandomNumberGenerator.GetBytes(64)));
        result.GetProperty("accepted").GetInt32().ShouldBe(0);
        result.GetProperty("stale").EnumerateArray().Select(s => s.GetString()).ShouldBe(["budget-1"]);

        var stored = (await phone.Pull()).GetProperty("records").EnumerateArray().Single();
        stored.GetProperty("ciphertext").GetBytesFromBase64().ShouldBe(newer);
    }

    [Fact]
    public async Task Malformed_batches_are_refused_whole()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        (await phone.Push(Device.Record("x", DateTimeOffset.UtcNow.AddDays(1)))).StatusCode
            .ShouldBe(HttpStatusCode.BadRequest, "a record stamped in the future would win every conflict");
        (await phone.Push(Device.Record("x", T0), Device.Record("x", T0))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Push(Device.Record("x", T0, new byte[5]))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Push(Device.Record("../../etc", T0))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Push(Device.Record("x", T0, collection: "Robert'); DROP TABLE"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Push([.. Enumerable.Range(0, 501).Select(i => Device.Record($"r{i}", T0, new byte[28]))])).StatusCode
            .ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Pull()).GetProperty("records").GetArrayLength().ShouldBe(0, "nothing from a refused batch was stored");
    }

    [Fact]
    public async Task Pull_pages_through_in_order()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        await phone.PushOk([.. Enumerable.Range(1, 7).Select(i => Device.Record($"r{i}", T0))]);

        var seen = new List<string>();
        long cursor = 0;
        bool more;
        do
        {
            var page = await phone.Pull(cursor, limit: 3);
            seen.AddRange(page.GetProperty("records").EnumerateArray().Select(r => r.GetProperty("record_id").GetString()!));
            cursor = page.GetProperty("last_seq").GetInt64();
            more = page.GetProperty("more").GetBoolean();
        }
        while (more);
        seen.ShouldBe(["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);
    }

    [Fact]
    public async Task Concurrent_pushes_from_several_devices_get_distinct_sequence_numbers()
    {
        var user = Guid.CreateVersion7();
        var devices = Enumerable.Range(0, 5).Select(_ => new Device(host, user)).ToList();
        try
        {
            await Task.WhenAll(devices.Select((d, i) => d.PushOk(
                Device.Record($"a{i}", T0), Device.Record($"b{i}", T0), Device.Record($"c{i}", T0))));
            var seqs = (await devices[0].Pull()).GetProperty("records").EnumerateArray()
                .Select(r => r.GetProperty("seq").GetInt64()).ToList();
            seqs.Count.ShouldBe(15);
            seqs.Distinct().Count().ShouldBe(15);
            seqs.ShouldBe(seqs.Order().ToList(), "pulled in sequence order");
        }
        finally
        {
            devices.ForEach(d => d.Dispose());
        }
    }

    [Fact]
    public async Task Users_never_see_each_others_records()
    {
        using var alice = new Device(host, Guid.CreateVersion7());
        using var bob = new Device(host, Guid.CreateVersion7());
        await alice.PushOk(Device.Record("private", T0));
        (await bob.Pull()).GetProperty("records").GetArrayLength().ShouldBe(0);
        // Same record id from another user is a different record.
        (await bob.PushOk(Device.Record("private", T0))).GetProperty("accepted").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task A_revoked_device_is_refused_while_its_token_is_still_valid()
    {
        var user = Guid.CreateVersion7();
        using var lost = new Device(host, user);
        using var phone = new Device(host, user);
        await lost.PushOk(Device.Record("r", T0));

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new DeviceRevokedV1(user, lost.DeviceId, DateTimeOffset.UtcNow));

        (await lost.Send(HttpMethod.Get, "/v1/sync/pull?since=0")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await lost.Push(Device.Record("r2", T0))).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await phone.Pull()).GetProperty("records").GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task After_tombstones_expire_a_device_that_was_behind_is_told_to_resync()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        await phone.PushOk(Device.Record("keep", T0));
        var cursor = (await phone.Pull()).GetProperty("last_seq").GetInt64();
        await phone.PushOk(Device.Record("gone", T0.AddMinutes(1), deleted: true));

        host.Clock.Offset = SyncRules.TombstoneRetention + TimeSpan.FromDays(1);
        try
        {
            await host.Host.InvokeMessageAndWaitAsync(new PurgeTombstones());
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }

        (await phone.Pull(cursor)).GetProperty("reset_required").GetBoolean()
            .ShouldBeTrue("this device never saw the deletion, which is no longer on the server");
        var full = await phone.Pull(0);
        full.GetProperty("reset_required").GetBoolean().ShouldBeFalse();
        full.GetProperty("records").EnumerateArray().Select(r => r.GetProperty("record_id").GetString()).ShouldBe(["keep"]);
    }

    [Fact]
    public async Task Account_deletion_purges_every_record_and_reports_back()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Device(host, user);
        await phone.PushOk(Device.Record("a", T0), Device.Record("b", T0));

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, DateTimeOffset.UtcNow.AddSeconds(-1)));
        tracked.Received.SingleMessage<UserDataPurgedV1>().Service.ShouldBe("sync");

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SyncDbContext>();
        (await db.Records.AnyAsync(r => r.UserId == user, TestContext.Current.CancellationToken)).ShouldBeFalse();
    }
}

[Collection(nameof(SyncTestGroup))]
public sealed class SyncReviewFixTests(SyncHost host)
{
    private static readonly DateTimeOffset T0 = DateTimeOffset.UtcNow.AddHours(-1);

    private async Task PurgeAsOf(TimeSpan later)
    {
        host.Clock.Offset = later;
        try
        {
            await host.Host.InvokeMessageAndWaitAsync(new PurgeTombstones());
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
    }

    [Fact]
    public async Task A_full_resync_after_a_purge_pages_to_the_end_without_being_told_to_reset_again()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        // More than one page of live records, then a tombstone above them.
        for (var batch = 0; batch < 2; batch++)
            await phone.PushOk([.. Enumerable.Range(0, 300).Select(i => Device.Record($"r{batch}-{i}", T0, new byte[28]))]);
        await phone.PushOk(Device.Record("gone", T0.AddMinutes(1), deleted: true));
        await PurgeAsOf(SyncRules.TombstoneRetention + TimeSpan.FromDays(1));

        (await phone.Pull(since: 5)).GetProperty("reset_required").GetBoolean().ShouldBeTrue("an old cursor from before the purge");

        long cursor = 0, epoch = 0;
        var seen = 0;
        for (var page = 0; page < 10; page++)
        {
            var result = await phone.Pull(cursor, limit: 500, epoch: epoch);
            result.GetProperty("reset_required").GetBoolean().ShouldBeFalse($"page {page} of the resync");
            seen += result.GetProperty("records").GetArrayLength();
            cursor = result.GetProperty("last_seq").GetInt64();
            epoch = result.GetProperty("epoch").GetInt64();
            if (!result.GetProperty("more").GetBoolean()) break;
        }
        seen.ShouldBe(600, "every live record, and the purged tombstone gone");
    }

    [Fact]
    public async Task A_timestamp_with_an_Indian_offset_is_accepted()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        var ist = new DateTimeOffset(DateTime.UtcNow.AddHours(-1).Ticks + TimeSpan.FromHours(5.5).Ticks, TimeSpan.FromHours(5.5));
        (await phone.Push(Device.Record("ist", ist))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_null_record_in_a_batch_is_a_400_not_a_crash()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        (await phone.Send(HttpMethod.Post, "/v1/sync/push", new { records = new object?[] { null } })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_cancelled_deletion_purges_nothing()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Device(host, user);
        await phone.PushOk(Device.Record("keep-me", T0));
        var executeAfter = DateTimeOffset.UtcNow.AddSeconds(-1);
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .PublishMessageAndWaitAsync(new AccountDeletionCancelledV1(user, executeAfter));
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, executeAfter));
        tracked.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        (await phone.Pull()).GetProperty("records").GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Attachments_round_trip_stay_private_and_go_with_the_account()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Device(host, user);
        using var stranger = new Device(host, Guid.CreateVersion7());
        var bytes = RandomNumberGenerator.GetBytes(300_000);
        const string id = "receipt-00000001";

        (await phone.SendBytes(HttpMethod.Put, $"/v1/sync/attachments/{id}", bytes)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var back = await phone.Send(HttpMethod.Get, $"/v1/sync/attachments/{id}");
        back.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await back.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken)).ShouldBe(bytes);
        (await stranger.Send(HttpMethod.Get, $"/v1/sync/attachments/{id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await phone.SendBytes(HttpMethod.Put, "/v1/sync/attachments/..%2Fescape", bytes)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, DateTimeOffset.UtcNow.AddSeconds(-2)));
        (await phone.Send(HttpMethod.Get, $"/v1/sync/attachments/{id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task With_attachments_disabled_records_still_sync_and_attachments_answer_503()
    {
        await using var disabled = host.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
        {
            s.RemoveAll<IAttachmentStore>();
            s.AddSingleton<IAttachmentStore, DisabledAttachmentStore>();
        }));
        using var phone = new Device(host, Guid.CreateVersion7(), disabled);
        (await phone.Send(HttpMethod.Get, "/v1/sync/pull")).StatusCode.ShouldBe(HttpStatusCode.OK);
        var put = await phone.SendBytes(HttpMethod.Put, "/v1/sync/attachments/receipt-00000002", new byte[1000]);
        put.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await put.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).ShouldContain("attachments_unavailable");
        // Nothing was stored, so reading it is a plain 404 (the service checks its own rows first).
        (await phone.Send(HttpMethod.Get, "/v1/sync/attachments/receipt-00000002")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_attachment_over_the_limit_is_refused()
    {
        using var phone = new Device(host, Guid.CreateVersion7());
        var tooBig = new byte[AttachmentRules.MaxBytes + 1];
        (await phone.SendBytes(HttpMethod.Put, "/v1/sync/attachments/huge-0000001", tooBig)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}

public class AttachmentProviderTests
{
    private static ServiceProvider Build(string provider, string environment) =>
        new ServiceCollection().AddSyncInfrastructure(
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Providers:Attachments"] = provider }).Build(),
            new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = environment }).BuildServiceProvider();

    [Fact]
    public void Disabled_is_allowed_outside_Development()
    {
        Build("Disabled", "Staging").GetRequiredService<IAttachmentStore>()
            .ShouldBeOfType<DisabledAttachmentStore>();
    }

    [Fact]
    public void LocalDisk_is_still_refused_outside_Development()
    {
        Should.Throw<InvalidOperationException>(() => Build("LocalDisk", "Staging"));
    }

    [Fact]
    public async Task The_disabled_store_refuses_files_but_lets_an_account_purge_finish()
    {
        var store = new DisabledAttachmentStore();
        var e = await Should.ThrowAsync<SyncException>(() => store.PutAsync(Guid.NewGuid(), "a", Stream.Null, TestContext.Current.CancellationToken));
        e.Error.ShouldBe(SyncError.Unavailable);
        await store.DeleteUserAsync(Guid.NewGuid(), TestContext.Current.CancellationToken);
    }
}

public class SyncRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 12, 0, 0, TimeSpan.Zero);

    private static IncomingRecord R(string id = "r1", string collection = "transactions", DateTimeOffset? at = null, bool deleted = false, int bytes = 64, int version = 1) =>
        new(id, collection, at ?? Now, deleted, new byte[bytes], version);

    [Fact]
    public void A_normal_batch_passes() => SyncRules.Validate([R(), R("r2")], Now).ShouldBeNull();

    [Fact]
    public void A_tombstone_may_carry_no_ciphertext() => SyncRules.Validate([R(deleted: true, bytes: 0)], Now).ShouldBeNull();

    [Theory]
    [InlineData("")]
    [InlineData("has space")]
    [InlineData("slash/id")]
    public void Bad_record_ids_fail(string id) => SyncRules.Validate([R(id)], Now).ShouldNotBeNull();

    [Fact]
    public void Clock_skew_is_tolerated_up_to_five_minutes()
    {
        SyncRules.Validate([R(at: Now.AddMinutes(4))], Now).ShouldBeNull();
        SyncRules.Validate([R(at: Now.AddMinutes(6))], Now).ShouldNotBeNull();
    }

    [Fact]
    public void Oversized_records_and_key_version_zero_fail()
    {
        SyncRules.Validate([R(bytes: SyncRules.MaxCiphertextBytes + 1)], Now).ShouldNotBeNull();
        SyncRules.Validate([R(version: 0)], Now).ShouldNotBeNull();
    }

    [Theory]
    [InlineData(0, 0, 1, 10, false)]
    [InlineData(5, 0, 1, 10, true)]
    [InlineData(5, 1, 1, 10, false)]
    [InlineData(10, 0, 1, 10, false)]
    [InlineData(12, 0, 1, 10, false)]
    public void Reset_is_needed_only_for_an_old_epoch_cursor_behind_purged_tombstones(long since, long epoch, long current, long purged, bool expected) =>
        SyncRules.NeedsReset(since, epoch, current, purged).ShouldBe(expected);
}
