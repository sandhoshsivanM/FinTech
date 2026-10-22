using System.Net;
using System.Text;
using System.Text.Json;
using Khazana.AuditReporting.Api;
using Khazana.AuditReporting.Application.Persistence;
using Khazana.AuditReporting.Domain;
using Khazana.Messaging.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.AuditReporting.Tests;

public class AuditChainTests
{
    private static readonly DateTimeOffset T = new(2026, 10, 22, 9, 0, 0, TimeSpan.Zero);

    private static List<(byte[], byte[], AuditEntry)> Chain(params AuditEntry[] entries)
    {
        var list = new List<(byte[], byte[], AuditEntry)>();
        var previous = AuditChain.Genesis;
        foreach (var e in entries)
        {
            var hash = AuditChain.Hash(previous, e);
            list.Add((previous, hash, e));
            previous = hash;
        }
        return list;
    }

    private static readonly AuditEntry A = new(T, "admin:ops@khazana.app", "admin.view.users", "page:users", null);
    private static readonly AuditEntry B = new(T.AddMinutes(1), "system:devices", "account.data_purged", "user:1", null);
    private static readonly AuditEntry C = new(T.AddMinutes(2), "user:1", "device.revoked", "device:2", null);

    [Fact]
    public void An_untouched_chain_verifies() => AuditChain.FirstBrokenLink(Chain(A, B, C)).ShouldBeNull();

    [Fact]
    public void Editing_a_record_breaks_the_chain_at_that_record()
    {
        var chain = Chain(A, B, C);
        chain[1] = (chain[1].Item1, chain[1].Item2, B with { Action = "account.nothing_happened" });
        AuditChain.FirstBrokenLink(chain).ShouldBe(1);
    }

    [Fact]
    public void Deleting_or_reordering_records_breaks_the_chain()
    {
        var chain = Chain(A, B, C);
        AuditChain.FirstBrokenLink([chain[0], chain[2]]).ShouldBe(1);
        AuditChain.FirstBrokenLink([chain[1], chain[0], chain[2]]).ShouldBe(0);
    }

    [Fact]
    public void Field_boundaries_are_unambiguous() =>
        AuditChain.Hash(AuditChain.Genesis, A with { Target = "ab", Reason = "c" })
            .ShouldNotBe(AuditChain.Hash(AuditChain.Genesis, A with { Target = "a", Reason = "bc" }));

    [Theory]
    [InlineData("root", "admin.view.users", "page:users")]
    [InlineData("admin:x", "DROP TABLE", "page:users")]
    [InlineData("admin:x", "admin.view.users", "line\nbreak")]
    public void Malformed_entries_are_refused(string actor, string action, string target) =>
        ReportingRules.IsValid(new AuditEntry(T, actor, action, target, null)).ShouldBeFalse();
}

public sealed class ReportingHost : IAsyncLifetime
{
    public const string Key = "test-internal-key-0123456789-abcdefghijklmnop";
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();
    public string ConnectionString => _postgres.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__reporting", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Environment.SetEnvironmentVariable("Reporting__InternalKey", Key);
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s => s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(PurgedProbe)))));
        _ = Factory.Server;
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}

/// <summary>Reporting consumes UserDataPurgedV1 itself; this only keeps the tracked session from waiting on nothing.</summary>
public static class PurgedProbe
{
    public static void Handle(AccountDeletedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(ReportingTestGroup))]
public sealed class ReportingTestGroup : ICollectionFixture<ReportingHost>;

[Collection(nameof(ReportingTestGroup))]
public sealed class ReportingFlowTests(ReportingHost host) : IDisposable
{
    private static readonly JsonSerializerOptions Snake = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _client = host.Factory.CreateClient();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private Task<ITrackedSession> Publish(object message) =>
        host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60)).PublishMessageAndWaitAsync(message);

    private async Task<HttpResponseMessage> Admin(HttpMethod method, string path, object? body = null, string? key = ReportingHost.Key)
    {
        using var request = new HttpRequestMessage(method, path);
        if (key is not null) request.Headers.Add(AdminEndpoints.KeyHeader, key);
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body, Snake), Encoding.UTF8, "application/json");
        return await _client.SendAsync(request, Ct);
    }

    private async Task<JsonElement> AdminJson(string path)
    {
        var response = await Admin(HttpMethod.Get, path);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement;
    }

    [Fact]
    public async Task Events_build_a_directory_entry_with_ids_counts_and_times_only()
    {
        var user = Guid.CreateVersion7();
        var device = Guid.CreateVersion7();
        var at = DateTimeOffset.UtcNow.AddMinutes(-5);
        await Publish(new UserRegisteredV1(user, device, "ios", at));
        await Publish(new UserSignedInV1(user, device, "ios", at));
        await Publish(new DeviceAddedV1(user, device, "ios", at));

        var detail = await AdminJson($"/internal/admin/users/{user}");
        var entry = detail.GetProperty("entry");
        entry.GetProperty("platforms").EnumerateArray().Select(p => p.GetString()).ShouldBe(["ios"]);
        entry.GetProperty("device_count").GetInt32().ShouldBe(1);
        detail.GetProperty("recent_signins").GetArrayLength().ShouldBe(1);

        // Nothing else about a user ever reaches the admin app.
        entry.EnumerateObject().Select(p => p.Name).Order().ToArray().ShouldBe(
            ["device_count", "last_active_at", "platforms", "registered_at", "status", "user_id"]);
    }

    [Fact]
    public async Task Events_for_one_user_arriving_at_the_same_moment_all_land()
    {
        // Live, a sign-up produces UserRegistered, UserSignedIn and DeviceAdded within
        // milliseconds, on three queues, handled in parallel.
        for (var round = 0; round < 5; round++)
        {
            var user = Guid.CreateVersion7();
            var device = Guid.CreateVersion7();
            var at = DateTimeOffset.UtcNow;
            await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
                .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async bus =>
                {
                    await bus.PublishAsync(new UserRegisteredV1(user, device, "ios", at));
                    await bus.PublishAsync(new UserSignedInV1(user, device, "ios", at));
                    await bus.PublishAsync(new DeviceAddedV1(user, device, "ios", at));
                }));
            var entry = (await AdminJson($"/internal/admin/users/{user}"));
            entry.GetProperty("entry").GetProperty("platforms").EnumerateArray().Select(p => p.GetString()).ShouldBe(["ios"], $"round {round}");
            entry.GetProperty("entry").GetProperty("device_count").GetInt32().ShouldBe(1, $"round {round}");
            entry.GetProperty("recent_signins").GetArrayLength().ShouldBe(1, $"round {round}");
        }
    }

    [Fact]
    public async Task A_sign_in_that_arrives_before_the_registration_still_lands()
    {
        var user = Guid.CreateVersion7();
        await Publish(new UserSignedInV1(user, Guid.CreateVersion7(), "android", DateTimeOffset.UtcNow));
        (await AdminJson($"/internal/admin/users/{user}")).GetProperty("entry").GetProperty("platforms")[0].GetString().ShouldBe("android");
    }

    [Fact]
    public async Task Without_the_internal_key_nothing_is_served()
    {
        (await Admin(HttpMethod.Get, "/internal/admin/metrics", key: null)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Admin(HttpMethod.Get, "/internal/admin/metrics", key: "wrong-key-wrong-key-wrong-key-wrong")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Admin(HttpMethod.Get, "/internal/admin/metrics")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Admin_actions_are_audited_and_the_chain_verifies()
    {
        (await Admin(HttpMethod.Post, "/internal/admin/audit", new { actor = "admin:ops@khazana.app", action = "admin.view.users", target = "page:users" }))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Admin(HttpMethod.Post, "/internal/admin/audit", new { actor = "user:someone", action = "admin.view.users", target = "page:users" }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest, "only admins are recorded through this door");

        var audit = await AdminJson("/internal/admin/audit?size=100");
        audit.GetProperty("items").EnumerateArray().ShouldContain(a => a.GetProperty("action").GetString() == "admin.view.users");
        (await AdminJson("/internal/admin/audit/verify")).GetProperty("intact").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task The_database_refuses_to_change_or_remove_an_audit_record()
    {
        await Admin(HttpMethod.Post, "/internal/admin/audit", new { actor = "admin:ops@khazana.app", action = "admin.view.audit", target = "page:audit" });
        await using var conn = new NpgsqlConnection(host.ConnectionString);
        await conn.OpenAsync(Ct);
        foreach (var sql in new[] { "UPDATE reporting.audit_events SET action = 'x.y.z'", "DELETE FROM reporting.audit_events", "TRUNCATE reporting.audit_events" })
        {
            await using var cmd = new NpgsqlCommand(sql, conn);
            var e = await Should.ThrowAsync<PostgresException>(() => cmd.ExecuteNonQueryAsync(Ct));
            e.MessageText.ShouldContain("append-only");
        }
    }

    [Fact]
    public async Task A_record_changed_behind_the_triggers_back_is_caught_by_the_chain()
    {
        await Admin(HttpMethod.Post, "/internal/admin/audit", new { actor = "admin:ops@khazana.app", action = "admin.view.metrics", target = "page:dashboard" });
        await Admin(HttpMethod.Post, "/internal/admin/audit", new { actor = "admin:ops@khazana.app", action = "admin.view.users", target = "page:users" });

        // What a superuser could do: switch the trigger off and rewrite history.
        // The record is put back afterwards: other tests share this database.
        await using var conn = new NpgsqlConnection(host.ConnectionString);
        await conn.OpenAsync(Ct);
        async Task Rewrite(string sql)
        {
            await using var cmd = new NpgsqlCommand($"""
                ALTER TABLE reporting.audit_events DISABLE TRIGGER audit_events_no_change;
                {sql}
                ALTER TABLE reporting.audit_events ENABLE TRIGGER audit_events_no_change;
                """, conn);
            await cmd.ExecuteNonQueryAsync(Ct);
        }

        await using var read = new NpgsqlCommand("SELECT id, target FROM reporting.audit_events ORDER BY id DESC OFFSET 1 LIMIT 1", conn);
        long id;
        string original;
        await using (var reader = await read.ExecuteReaderAsync(Ct))
        {
            await reader.ReadAsync(Ct);
            id = reader.GetInt64(0);
            original = reader.GetString(1);
        }

        await Rewrite($"UPDATE reporting.audit_events SET target = 'page:nothing-to-see' WHERE id = {id};");
        try
        {
            var status = await AdminJson("/internal/admin/audit/verify");
            status.GetProperty("intact").GetBoolean().ShouldBeFalse();
            status.GetProperty("first_broken_id").GetInt64().ShouldBe(id);
        }
        finally
        {
            await using var restore = new NpgsqlCommand("""
                ALTER TABLE reporting.audit_events DISABLE TRIGGER audit_events_no_change;
                UPDATE reporting.audit_events SET target = @t WHERE id = @id;
                ALTER TABLE reporting.audit_events ENABLE TRIGGER audit_events_no_change;
                """, conn);
            restore.Parameters.AddWithValue("t", original);
            restore.Parameters.AddWithValue("id", id);
            await restore.ExecuteNonQueryAsync(Ct);
        }
        (await AdminJson("/internal/admin/audit/verify")).GetProperty("intact").GetBoolean().ShouldBeTrue("restored exactly, the chain holds again");
    }

    [Fact]
    public async Task Account_deletion_purges_sign_ins_and_the_entry_and_a_late_event_cannot_bring_them_back()
    {
        var user = Guid.CreateVersion7();
        var device = Guid.CreateVersion7();
        await Publish(new UserRegisteredV1(user, device, "web", DateTimeOffset.UtcNow));
        await Publish(new UserSignedInV1(user, device, "web", DateTimeOffset.UtcNow));

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, DateTimeOffset.UtcNow.AddSeconds(-1)));
        tracked.Sent.MessagesOf<UserDataPurgedV1>().ShouldContain(p => p.Service == "reporting" && p.UserId == user);

        (await Admin(HttpMethod.Get, $"/internal/admin/users/{user}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        await Publish(new UserSignedInV1(user, device, "web", DateTimeOffset.UtcNow));
        (await Admin(HttpMethod.Get, $"/internal/admin/users/{user}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();
        (await db.SigninEvents.AnyAsync(s => s.UserId == user, Ct)).ShouldBeFalse();
        (await db.AuditEvents.AnyAsync(a => a.Action == "account.deletion_requested" && a.Target == $"user:{user}", Ct))
            .ShouldBeTrue("the audit trail keeps the fact, with ids only");
    }

    [Fact]
    public async Task Metrics_count_users_activity_and_platforms()
    {
        var user = Guid.CreateVersion7();
        await Publish(new UserRegisteredV1(user, Guid.CreateVersion7(), "macos", DateTimeOffset.UtcNow));
        var metrics = await AdminJson("/internal/admin/metrics?days=7");
        metrics.GetProperty("total_users").GetInt32().ShouldBeGreaterThanOrEqualTo(1);
        metrics.GetProperty("signups_by_day").GetArrayLength().ShouldBeGreaterThanOrEqualTo(1);
    }

    public void Dispose() => _client.Dispose();
}
