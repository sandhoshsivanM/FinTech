using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Khazana.Devices.Application.Persistence;
using Khazana.Devices.Domain;
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

namespace Khazana.Devices.Tests;

public sealed class TestClock : IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

/// <summary>
/// Devices & Keys against real Postgres and RabbitMQ. Tokens come from a test
/// issuer the service is told to trust, minted exactly as Identity mints them.
/// </summary>
public sealed class DevicesHost : IAsyncLifetime
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
        Environment.SetEnvironmentVariable("ConnectionStrings__devices", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IConfigurationManager<OpenIdConnectConfiguration>>();
                s.AddSingleton(Issuer.Keys);
                s.RemoveAll<IClock>();
                s.AddSingleton<IClock>(Clock);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(DeviceEventProbe)));
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

public static class DeviceEventProbe
{
    public static void Handle(DeviceAddedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(DeviceRevokedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(UserDataPurgedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(DevicesTestGroup))]
public sealed class DevicesTestGroup : ICollectionFixture<DevicesHost>;

/// <summary>One phone: a session (user, device id), its DPoP key and its X25519 public key.</summary>
public sealed class Phone(DevicesHost host, Guid userId) : IDisposable
{
    private readonly HttpClient _client = host.Factory.CreateClient();
    public Guid UserId { get; } = userId;
    public Guid DeviceId { get; } = Guid.CreateVersion7();
    public DeviceKey Key { get; private set; } = new();
    public byte[] PublicKey { get; } = RandomNumberGenerator.GetBytes(32);

    public void SwitchDpopKey() => Key = new DeviceKey();

    /// <param name="stepUpAt">When the passkey check behind a step-up token happened (null: an ordinary token).</param>
    public async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body = null, DateTimeOffset? stepUpAt = null)
    {
        var token = host.Issuer.Mint(UserId, DeviceId, Key, stepUpAt: stepUpAt);
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", token);
        request.Headers.Add("DPoP", Key.Proof(method.Method, "http://localhost" + path, token));
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body, Json.Options), Encoding.UTF8, "application/json");
        return await _client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    public async Task<JsonElement> Ok(HttpMethod method, string path, object? body = null)
    {
        var response = await Send(method, path, body);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    public Task<JsonElement> Register(string name = "Phone") =>
        Ok(HttpMethod.Post, "/v1/devices/register", new { name, platform = "ios", app_version = "2.0.0", public_key = PublicKey });

    public void Dispose()
    {
        _client.Dispose();
        Key.Dispose();
    }
}

internal static class Json
{
    public static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public static object Envelope(byte[] wrapped, bool recovery = false, int version = 1) =>
        new { wrapped_dek = wrapped, alg = recovery ? KeyRules.RecoveryAlg : KeyRules.DeviceAlg, key_version = version };
}

[Collection(nameof(DevicesTestGroup))]
public sealed class DevicesFlowTests(DevicesHost host)
{
    private static readonly byte[] KeyCheck = RandomNumberGenerator.GetBytes(32);
    private static byte[] Wrapped() => RandomNumberGenerator.GetBytes(80);

    private async Task<(Phone Phone, byte[] RecoveryEnvelope)> BootstrappedPhone(Guid user)
    {
        var phone = new Phone(host, user);
        await phone.Register();
        var recovery = Wrapped();
        (await phone.Send(HttpMethod.Post, "/v1/keys/bootstrap", new
        {
            device = Json.Envelope(Wrapped()),
            recovery = Json.Envelope(recovery, recovery: true),
            key_check = KeyCheck,
        })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        return (phone, recovery);
    }

    [Fact]
    public async Task Registering_announces_the_device_once_and_a_key_change_is_refused()
    {
        using var phone = new Phone(host, Guid.CreateVersion7());
        JsonElement status = default;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ => status = await phone.Register()));

        tracked.Received.SingleMessage<DeviceAddedV1>().DeviceId.ShouldBe(phone.DeviceId);
        status.GetProperty("has_key").GetBoolean().ShouldBeFalse();
        status.GetProperty("account_has_keys").GetBoolean().ShouldBeFalse();

        var again = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ => await phone.Register("Renamed")));
        again.Sent.MessagesOf<DeviceAddedV1>().ShouldBeEmpty("registering again is not a new device");

        var other = await phone.Send(HttpMethod.Post, "/v1/devices/register",
            new { name = "x", platform = "ios", public_key = RandomNumberGenerator.GetBytes(32) });
        other.StatusCode.ShouldBe(HttpStatusCode.Conflict, "its envelope is wrapped to the first key");
    }

    [Fact]
    public async Task An_unregistered_device_or_a_token_on_another_key_gets_nothing()
    {
        using var stranger = new Phone(host, Guid.CreateVersion7());
        (await stranger.Send(HttpMethod.Get, "/v1/devices/")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        using var phone = new Phone(host, Guid.CreateVersion7());
        await phone.Register();
        phone.SwitchDpopKey(); // same device id, a token bound to a different key
        (await phone.Send(HttpMethod.Get, "/v1/devices/")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task The_first_device_bootstraps_once_and_junk_key_material_is_refused()
    {
        var user = Guid.CreateVersion7();
        using var phone = new Phone(host, user);
        await phone.Register();

        (await phone.Send(HttpMethod.Post, "/v1/keys/bootstrap", new
        {
            device = Json.Envelope(new byte[10]), recovery = Json.Envelope(Wrapped(), recovery: true), key_check = KeyCheck,
        })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await phone.Send(HttpMethod.Post, "/v1/keys/bootstrap", new
        {
            device = Json.Envelope(Wrapped()), recovery = Json.Envelope(Wrapped(), recovery: false), key_check = KeyCheck,
        })).StatusCode.ShouldBe(HttpStatusCode.BadRequest, "the recovery envelope must use the recovery algorithm");

        var (first, _) = await BootstrappedPhone(user);
        using (first)
        {
            (await first.Ok(HttpMethod.Get, "/v1/devices/me")).GetProperty("has_key").GetBoolean().ShouldBeTrue();
            (await first.Send(HttpMethod.Post, "/v1/keys/bootstrap", new
            {
                device = Json.Envelope(Wrapped()), recovery = Json.Envelope(Wrapped(), recovery: true), key_check = KeyCheck,
            })).StatusCode.ShouldBe(HttpStatusCode.Conflict, "an account has one data key");
        }
    }

    [Fact]
    public async Task QR_pairing_hands_the_new_device_its_envelope_once_and_only_with_the_scanned_code()
    {
        var user = Guid.CreateVersion7();
        var (old, _) = await BootstrappedPhone(user);
        using var oldPhone = old;
        using var newPhone = new Phone(host, user);
        await newPhone.Register("New phone");

        var start = await newPhone.Ok(HttpMethod.Post, "/v1/devices/pairing");
        var pairingId = start.GetProperty("pairing_id").GetGuid();
        var code = start.GetProperty("code").GetString()!;

        // The old phone reads the new phone's public key and checks it against the QR.
        var target = await oldPhone.Ok(HttpMethod.Get, $"/v1/devices/pairing/{pairingId}");
        target.GetProperty("public_key").GetBytesFromBase64().ShouldBe(newPhone.PublicKey);

        // The new phone itself can't approve: it doesn't hold the key.
        var forNew = Wrapped();
        (await newPhone.Send(HttpMethod.Post, $"/v1/devices/pairing/{pairingId}/approve",
            new { code, envelope = Json.Envelope(forNew) })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        // A guessed code is refused.
        (await oldPhone.Send(HttpMethod.Post, $"/v1/devices/pairing/{pairingId}/approve",
            new { code = "AAAAAAAAAAAAAAAAAAAAAA", envelope = Json.Envelope(forNew) })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        (await oldPhone.Send(HttpMethod.Post, $"/v1/devices/pairing/{pairingId}/approve",
            new { code, envelope = Json.Envelope(forNew) })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await newPhone.Ok(HttpMethod.Get, "/v1/keys/envelopes/self")).GetProperty("wrapped_dek").GetBytesFromBase64().ShouldBe(forNew);

        (await oldPhone.Send(HttpMethod.Post, $"/v1/devices/pairing/{pairingId}/approve",
            new { code, envelope = Json.Envelope(Wrapped()) })).StatusCode.ShouldBe(HttpStatusCode.NotFound, "a code approves once");
    }

    [Fact]
    public async Task A_pairing_code_expires_after_five_minutes()
    {
        var user = Guid.CreateVersion7();
        var (old, _) = await BootstrappedPhone(user);
        using var oldPhone = old;
        using var newPhone = new Phone(host, user);
        await newPhone.Register();
        var start = await newPhone.Ok(HttpMethod.Post, "/v1/devices/pairing");

        host.Clock.Offset = PairingRules.Lifetime + TimeSpan.FromSeconds(1);
        try
        {
            (await oldPhone.Send(HttpMethod.Post, $"/v1/devices/pairing/{start.GetProperty("pairing_id").GetGuid()}/approve",
                new { code = start.GetProperty("code").GetString(), envelope = Json.Envelope(Wrapped()) }))
                .StatusCode.ShouldBe(HttpStatusCode.NotFound);
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
    }

    [Fact]
    public async Task Recovery_gives_the_sealed_envelope_and_a_device_must_prove_the_key_to_store_its_own()
    {
        var user = Guid.CreateVersion7();
        var (old, recovery) = await BootstrappedPhone(user);
        old.Dispose();
        using var replacement = new Phone(host, user);
        await replacement.Register();

        (await replacement.Ok(HttpMethod.Get, "/v1/keys/envelopes/recovery")).GetProperty("wrapped_dek").GetBytesFromBase64().ShouldBe(recovery);

        (await replacement.Send(HttpMethod.Post, "/v1/keys/envelopes/self",
            new { envelope = Json.Envelope(Wrapped()), key_check = RandomNumberGenerator.GetBytes(32) }))
            .StatusCode.ShouldBe(HttpStatusCode.Forbidden, "without the data key there is no key check");
        (await replacement.Send(HttpMethod.Post, "/v1/keys/envelopes/self",
            new { envelope = Json.Envelope(Wrapped()), key_check = KeyCheck })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await replacement.Ok(HttpMethod.Get, "/v1/devices/me")).GetProperty("has_key").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task Remote_logout_deletes_the_envelope_announces_it_and_locks_the_device_out()
    {
        var user = Guid.CreateVersion7();
        var (owner, _) = await BootstrappedPhone(user);
        using var ownerPhone = owner;
        using var lost = new Phone(host, user);
        await lost.Register("Lost phone");
        (await lost.Send(HttpMethod.Post, "/v1/keys/envelopes/self",
            new { envelope = Json.Envelope(Wrapped()), key_check = KeyCheck })).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        HttpResponseMessage? response = null;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                response = await ownerPhone.Send(HttpMethod.Delete, $"/v1/devices/{lost.DeviceId}", stepUpAt: DateTimeOffset.UtcNow)));
        response!.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        tracked.Received.SingleMessage<DeviceRevokedV1>().DeviceId.ShouldBe(lost.DeviceId);

        (await lost.Send(HttpMethod.Get, "/v1/keys/envelopes/self")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var devices = await ownerPhone.Ok(HttpMethod.Get, "/v1/devices/");
        devices.EnumerateArray().Select(d => d.GetProperty("id").GetGuid()).ShouldNotContain(lost.DeviceId);

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DevicesDbContext>();
        (await db.KeyEnvelopes.AnyAsync(e => e.DeviceId == lost.DeviceId, TestContext.Current.CancellationToken)).ShouldBeFalse();
    }

    [Fact]
    public async Task Removing_a_device_needs_a_fresh_passkey_check()
    {
        var user = Guid.CreateVersion7();
        var (owner, _) = await BootstrappedPhone(user);
        using var ownerPhone = owner;
        using var other = new Phone(host, user);
        await other.Register("Other");
        var path = $"/v1/devices/{other.DeviceId}";

        async Task<string> Refused(DateTimeOffset? at)
        {
            var response = await ownerPhone.Send(HttpMethod.Delete, path, stepUpAt: at);
            response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
            return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("error").GetString()!;
        }

        (await Refused(null)).ShouldBe("step_up_required");
        (await Refused(DateTimeOffset.UtcNow.AddMinutes(-5))).ShouldBe("step_up_required");
        (await Refused(DateTimeOffset.UtcNow.AddMinutes(10))).ShouldBe("step_up_required");
        (await ownerPhone.Ok(HttpMethod.Get, "/v1/devices/")).GetArrayLength().ShouldBe(2);

        (await ownerPhone.Send(HttpMethod.Delete, path, stepUpAt: DateTimeOffset.UtcNow)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await ownerPhone.Ok(HttpMethod.Get, "/v1/devices/")).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task A_device_can_be_renamed_by_the_owner_but_not_by_anyone_else()
    {
        var user = Guid.CreateVersion7();
        var (owner, _) = await BootstrappedPhone(user);
        using var ownerPhone = owner;
        using var other = new Phone(host, user);
        await other.Register("Old name");
        var (stranger, _) = await BootstrappedPhone(Guid.CreateVersion7());
        using var strangerPhone = stranger;
        var path = $"/v1/devices/{other.DeviceId}";

        (await ownerPhone.Send(HttpMethod.Patch, path, new { name = "  Kitchen\u0007 iPad  " })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var names = (await ownerPhone.Ok(HttpMethod.Get, "/v1/devices/")).EnumerateArray()
            .ToDictionary(d => d.GetProperty("id").GetGuid(), d => d.GetProperty("name").GetString());
        names[other.DeviceId].ShouldBe("Kitchen iPad");

        (await ownerPhone.Send(HttpMethod.Patch, path, new { name = "   " })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await strangerPhone.Send(HttpMethod.Patch, path, new { name = "Mine now" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await ownerPhone.Send(HttpMethod.Patch, $"/v1/devices/{Guid.NewGuid()}", new { name = "Ghost" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_revoked_device_cannot_be_renamed_and_stays_off_the_list()
    {
        var user = Guid.CreateVersion7();
        var (owner, _) = await BootstrappedPhone(user);
        using var ownerPhone = owner;
        using var lost = new Phone(host, user);
        await lost.Register("Lost");
        var path = $"/v1/devices/{lost.DeviceId}";
        (await ownerPhone.Send(HttpMethod.Delete, path, stepUpAt: DateTimeOffset.UtcNow)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await ownerPhone.Send(HttpMethod.Patch, path, new { name = "Back" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await lost.Send(HttpMethod.Patch, $"/v1/devices/{ownerPhone.DeviceId}", new { name = "Hijack" })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await lost.Send(HttpMethod.Get, "/v1/devices/")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task One_user_can_never_reach_another_users_devices_or_pairing()
    {
        var (alice, _) = await BootstrappedPhone(Guid.CreateVersion7());
        using var a = alice;
        var (mallory, _) = await BootstrappedPhone(Guid.CreateVersion7());
        using var m = mallory;
        using var aliceNew = new Phone(host, a.UserId);
        await aliceNew.Register();
        var pairingId = (await aliceNew.Ok(HttpMethod.Post, "/v1/devices/pairing")).GetProperty("pairing_id").GetGuid();

        (await m.Send(HttpMethod.Get, $"/v1/devices/pairing/{pairingId}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await m.Send(HttpMethod.Delete, $"/v1/devices/{a.DeviceId}", stepUpAt: DateTimeOffset.UtcNow)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await m.Ok(HttpMethod.Get, "/v1/devices/")).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Account_deletion_purges_everything_after_the_cooling_off_and_reports_back()
    {
        var user = Guid.CreateVersion7();
        var (phone, _) = await BootstrappedPhone(user);
        phone.Dispose();

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, DateTimeOffset.UtcNow.AddSeconds(-1)));

        var purged = tracked.Received.SingleMessage<UserDataPurgedV1>();
        purged.UserId.ShouldBe(user);
        purged.Service.ShouldBe("devices");

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DevicesDbContext>();
        var ct = TestContext.Current.CancellationToken;
        (await db.Devices.AnyAsync(d => d.UserId == user, ct)).ShouldBeFalse();
        (await db.KeyEnvelopes.AnyAsync(e => e.UserId == user, ct)).ShouldBeFalse();
        (await db.KeyChecks.AnyAsync(k => k.UserId == user, ct)).ShouldBeFalse();
    }
}

[Collection(nameof(DevicesTestGroup))]
public sealed class ReviewFixTests(DevicesHost host)
{
    private static readonly byte[] KeyCheck = RandomNumberGenerator.GetBytes(32);

    private async Task<Phone> Bootstrapped(Guid user)
    {
        var phone = new Phone(host, user);
        await phone.Register();
        (await phone.Send(HttpMethod.Post, "/v1/keys/bootstrap", new
        {
            device = Json.Envelope(RandomNumberGenerator.GetBytes(80)),
            recovery = Json.Envelope(RandomNumberGenerator.GetBytes(80), recovery: true),
            key_check = KeyCheck,
        })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        return phone;
    }

    [Fact]
    public async Task A_logout_in_Identity_revokes_the_device_here_and_tells_everyone()
    {
        using var phone = await Bootstrapped(Guid.CreateVersion7());
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new SessionEndedV1(phone.UserId, phone.DeviceId, DateTimeOffset.UtcNow));
        tracked.Sent.SingleMessage<DeviceRevokedV1>().DeviceId.ShouldBe(phone.DeviceId);
        (await phone.Send(HttpMethod.Get, "/v1/keys/envelopes/self")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var again = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .PublishMessageAndWaitAsync(new SessionEndedV1(phone.UserId, phone.DeviceId, DateTimeOffset.UtcNow));
        again.Sent.MessagesOf<DeviceRevokedV1>().ShouldBeEmpty("already revoked: nothing new to announce");
    }

    [Fact]
    public async Task A_cancelled_deletion_purges_nothing_when_its_purge_fires()
    {
        using var phone = await Bootstrapped(Guid.CreateVersion7());
        var executeAfter = DateTimeOffset.UtcNow.AddSeconds(-1);
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .PublishMessageAndWaitAsync(new AccountDeletionCancelledV1(phone.UserId, executeAfter));
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(phone.UserId, executeAfter));

        tracked.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DevicesDbContext>();
        (await db.Devices.AnyAsync(d => d.UserId == phone.UserId, TestContext.Current.CancellationToken)).ShouldBeTrue();
    }

    [Fact]
    public async Task Approving_for_a_device_that_already_holds_the_key_is_a_409_and_keeps_the_code_usable()
    {
        var user = Guid.CreateVersion7();
        using var old = await Bootstrapped(user);
        using var fresh = new Phone(host, user);
        await fresh.Register();
        var start = await fresh.Ok(HttpMethod.Post, "/v1/devices/pairing");
        // Meanwhile the new device recovers with the phrase and stores its own envelope.
        (await fresh.Send(HttpMethod.Post, "/v1/keys/envelopes/self",
            new { envelope = Json.Envelope(RandomNumberGenerator.GetBytes(80)), key_check = KeyCheck })).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var approve = await old.Send(HttpMethod.Post, $"/v1/devices/pairing/{start.GetProperty("pairing_id").GetGuid()}/approve",
            new { code = start.GetProperty("code").GetString(), envelope = Json.Envelope(RandomNumberGenerator.GetBytes(80)) });
        approve.StatusCode.ShouldBe(HttpStatusCode.Conflict, "a clear refusal, not a 500 with the session silently burnt");

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DevicesDbContext>();
        (await db.PairingSessions.SingleAsync(p => p.Id == start.GetProperty("pairing_id").GetGuid(), TestContext.Current.CancellationToken))
            .CompletedAt.ShouldBeNull("the claim was rolled back with the failed insert");
    }

    [Fact]
    public async Task A_body_missing_a_required_field_is_a_400_not_a_crash()
    {
        using var phone = await Bootstrapped(Guid.CreateVersion7());
        (await phone.Send(HttpMethod.Post, $"/v1/devices/pairing/{Guid.NewGuid()}/approve", new { code = "x" }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}

[Collection(nameof(DevicesTestGroup))]
public sealed class CoolingOffTests(DevicesHost host)
{
    [Fact]
    public async Task Nothing_is_deleted_before_the_cooling_off_ends()
    {
        using var phone = new Phone(host, Guid.CreateVersion7());
        await phone.Register();

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(phone.UserId, DateTimeOffset.UtcNow.AddHours(24)));

        tracked.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DevicesDbContext>();
        (await db.Devices.AnyAsync(d => d.UserId == phone.UserId, TestContext.Current.CancellationToken))
            .ShouldBeTrue("the user may still change their mind");
    }
}

public class DeviceRulesTests
{
    [Theory]
    [InlineData("  Asha's iPhone ", "Asha's iPhone")]
    [InlineData("", "Device")]
    [InlineData("bad\u0000name\u0007", "badname")]
    public void Names_are_cleaned(string input, string expected) => DeviceRules.CleanName(input).ShouldBe(expected);

    [Fact]
    public void Long_names_are_cut() => DeviceRules.CleanName(new string('x', 200)).Length.ShouldBe(DeviceRules.MaxNameLength);

    [Fact]
    public void Key_material_is_checked_for_shape_only()
    {
        KeyRules.IsValidPublicKey(new byte[32]).ShouldBeFalse("all zeros is not a key");
        KeyRules.IsValidPublicKey(RandomNumberGenerator.GetBytes(32)).ShouldBeTrue();
        KeyRules.IsValidEnvelope(new byte[80], KeyRules.DeviceAlg, 1, recovery: false).ShouldBeTrue();
        KeyRules.IsValidEnvelope(new byte[80], KeyRules.DeviceAlg, 0, recovery: false).ShouldBeFalse();
        KeyRules.IsValidEnvelope(new byte[600], KeyRules.DeviceAlg, 1, recovery: false).ShouldBeFalse();
        KeyRules.IsValidEnvelope(new byte[80], "rot13", 1, recovery: false).ShouldBeFalse();
    }
}
