using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Khazana.Messaging.Contracts;
using Khazana.Notification.Application;
using Khazana.Notification.Application.Persistence;
using Khazana.Notification.Domain;
using Khazana.Notification.Infrastructure;
using Khazana.TestKit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.Notification.Tests;

/// <summary>Answers HTTP calls from a script, and remembers them.</summary>
public sealed class FakeHttp(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
{
    public List<(HttpRequestMessage Request, string Body)> Calls { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        Calls.Add((request, body));
        return respond(request, body);
    }

    public static HttpResponseMessage Json(HttpStatusCode code, string json) =>
        new(code) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

public sealed class FcmPushSenderTests : IDisposable
{
    private readonly RSA _rsa = RSA.Create(2048);
    private FcmOptions Options => new() { ProjectId = "khazana-test", ClientEmail = "push@khazana-test.iam.gserviceaccount.com", PrivateKeyPem = _rsa.ExportPkcs8PrivateKeyPem() };

    private static FakeHttp Google(HttpStatusCode sendStatus = HttpStatusCode.OK, string sendBody = "{}") => new((req, _) =>
        req.RequestUri!.Host == "oauth2.googleapis.com"
            ? FakeHttp.Json(HttpStatusCode.OK, """{"access_token":"ya29.test","expires_in":3600}""")
            : FakeHttp.Json(sendStatus, sendBody));

    [Fact]
    public async Task A_sync_nudge_is_data_only_and_authenticated_with_a_signed_service_account_assertion()
    {
        var fake = Google();
        using var sender = new FcmPushSender(new HttpClient(fake), Options, TimeProvider.System);
        (await sender.SendAsync("fcm-token", PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.Delivered);

        var (oauth, form) = fake.Calls[0];
        var assertion = form.Split('&').Single(p => p.StartsWith("assertion=", StringComparison.Ordinal))["assertion=".Length..];
        var verified = await new JsonWebTokenHandler().ValidateTokenAsync(Uri.UnescapeDataString(assertion), new()
        {
            IssuerSigningKey = new RsaSecurityKey(_rsa.ExportParameters(false)),
            ValidIssuer = Options.ClientEmail, ValidAudience = "https://oauth2.googleapis.com/token",
        });
        verified.IsValid.ShouldBeTrue("Google only accepts an assertion signed by the service account key");

        var (send, body) = fake.Calls[1];
        send.RequestUri!.ToString().ShouldBe("https://fcm.googleapis.com/v1/projects/khazana-test/messages:send");
        send.Headers.Authorization!.Parameter.ShouldBe("ya29.test");
        using var json = JsonDocument.Parse(body);
        var message = json.RootElement.GetProperty("message");
        message.GetProperty("data").GetProperty("type").GetString().ShouldBe("sync");
        message.TryGetProperty("notification", out _).ShouldBeFalse("a sync nudge shows nothing to the user");
    }

    [Fact]
    public async Task The_access_token_is_reused_until_it_nears_expiry()
    {
        var fake = Google();
        using var sender = new FcmPushSender(new HttpClient(fake), Options, TimeProvider.System);
        await sender.SendAsync("a", PushContent.SyncNudge, TestContext.Current.CancellationToken);
        await sender.SendAsync("b", PushContent.SyncNudge, TestContext.Current.CancellationToken);
        fake.Calls.Count(c => c.Request.RequestUri!.Host == "oauth2.googleapis.com").ShouldBe(1);
    }

    [Fact]
    public async Task An_unregistered_token_is_reported_invalid_and_a_server_error_is_transient()
    {
        using (var dead = new FcmPushSender(new HttpClient(Google(HttpStatusCode.NotFound, """{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}""")), Options, TimeProvider.System))
            (await dead.SendAsync("t", PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.TokenInvalid);
        using var flaky = new FcmPushSender(new HttpClient(Google(HttpStatusCode.ServiceUnavailable)), Options, TimeProvider.System);
        (await flaky.SendAsync("t", PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.Failed);
    }

    [Fact]
    public void The_service_account_file_is_read_as_Google_writes_it()
    {
        var json = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["type"] = "service_account", ["project_id"] = "p1", ["client_email"] = "e@p1.iam.gserviceaccount.com",
            ["private_key"] = _rsa.ExportPkcs8PrivateKeyPem(), ["token_uri"] = "https://oauth2.googleapis.com/token",
        });
        var o = FcmOptions.FromServiceAccountJson(json);
        o.ProjectId.ShouldBe("p1");
        o.ClientEmail.ShouldBe("e@p1.iam.gserviceaccount.com");
    }

    public void Dispose() => _rsa.Dispose();
}

public sealed class ApnsPushSenderTests : IDisposable
{
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private ApnsOptions Options => new() { TeamId = "TEAM123456", KeyId = "KEY1234567", BundleId = "com.khazana.app", PrivateKeyPem = _key.ExportPkcs8PrivateKeyPem() };
    private const string Token = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    [Fact]
    public async Task A_sync_nudge_is_a_background_push_at_priority_5_over_HTTP2()
    {
        var fake = new FakeHttp((_, _) => new HttpResponseMessage(HttpStatusCode.OK));
        var sender = new ApnsPushSender(new HttpClient(fake), Options, TimeProvider.System);
        (await sender.SendAsync(Token, PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.Delivered);

        var (request, body) = fake.Calls.Single();
        request.RequestUri!.ToString().ShouldBe($"https://api.push.apple.com/3/device/{Token}");
        request.Version.ShouldBe(HttpVersion.Version20);
        request.Headers.GetValues("apns-push-type").Single().ShouldBe("background");
        request.Headers.GetValues("apns-priority").Single().ShouldBe("5", "Apple rejects background pushes at priority 10");
        request.Headers.GetValues("apns-topic").Single().ShouldBe("com.khazana.app");
        using var json = JsonDocument.Parse(body);
        json.RootElement.GetProperty("aps").GetProperty("content-available").GetInt32().ShouldBe(1);
        json.RootElement.GetProperty("aps").TryGetProperty("alert", out _).ShouldBeFalse();

        var jwt = new JsonWebToken(request.Headers.Authorization!.Parameter);
        jwt.Kid.ShouldBe("KEY1234567");
        jwt.Issuer.ShouldBe("TEAM123456");
    }

    [Fact]
    public async Task A_new_device_alert_is_visible_and_says_nothing_about_money()
    {
        var fake = new FakeHttp((_, _) => new HttpResponseMessage(HttpStatusCode.OK));
        var sender = new ApnsPushSender(new HttpClient(fake), Options, TimeProvider.System);
        await sender.SendAsync(Token, PushContent.NewDevice("android"), TestContext.Current.CancellationToken);
        var (request, body) = fake.Calls.Single();
        request.Headers.GetValues("apns-push-type").Single().ShouldBe("alert");
        body.ShouldContain("New device on your account");
        body.ShouldNotContain("₹");
    }

    [Fact]
    public async Task A_gone_token_is_invalid_and_a_token_that_is_not_hex_never_reaches_the_URL()
    {
        var gone = new ApnsPushSender(new HttpClient(new FakeHttp((_, _) => FakeHttp.Json(HttpStatusCode.Gone, """{"reason":"Unregistered"}"""))), Options, TimeProvider.System);
        (await gone.SendAsync(Token, PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.TokenInvalid);

        var fake = new FakeHttp((_, _) => new HttpResponseMessage(HttpStatusCode.OK));
        var sender = new ApnsPushSender(new HttpClient(fake), Options, TimeProvider.System);
        (await sender.SendAsync("../../3/device/other", PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.TokenInvalid);
        fake.Calls.ShouldBeEmpty();
    }

    public void Dispose() => _key.Dispose();
}

public sealed class WebPushTests
{
    // RFC 8291 Appendix A, the published example.
    private const string Plaintext = "When I grow up, I want to be a watermelon";
    private const string AsPrivate = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    private const string AsPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    private const string UaPrivate = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    private const string UaPublic = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    private const string AuthSecret = "BTBZMqHH6r4Tts7J_aSIgg";
    private const string Salt = "DGv6ra1nlYgDCS1FRnbzlw";
    private const string Expected = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    private static ECDiffieHellman Key(string priv, string pub)
    {
        var q = Base64UrlEncoder.DecodeBytes(pub);
        return ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            D = Base64UrlEncoder.DecodeBytes(priv),
            Q = new ECPoint { X = q[1..33], Y = q[33..65] },
        });
    }

    [Fact]
    public void Encryption_matches_the_RFC_8291_example_byte_for_byte()
    {
        using var sender = Key(AsPrivate, AsPublic);
        var body = WebPushEncryption.Encrypt(Encoding.UTF8.GetBytes(Plaintext), Base64UrlEncoder.DecodeBytes(UaPublic),
            Base64UrlEncoder.DecodeBytes(AuthSecret), sender, Base64UrlEncoder.DecodeBytes(Salt));
        Base64UrlEncoder.Encode(body).ShouldBe(Expected);
    }

    [Fact]
    public async Task A_push_carries_VAPID_and_aes128gcm_and_a_gone_subscription_is_dropped()
    {
        using var vapid = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var options = new WebPushOptions { PrivateKeyPem = vapid.ExportPkcs8PrivateKeyPem(), Subject = "mailto:security@khazana.app" };
        var subscription = JsonSerializer.Serialize(new
        {
            endpoint = "https://updates.push.services.mozilla.com/wpush/v2/abc",
            keys = new { p256dh = UaPublic, auth = AuthSecret },
        });

        var fake = new FakeHttp((_, _) => new HttpResponseMessage(HttpStatusCode.Created));
        var sender = new WebPushSender(new HttpClient(fake), options, TimeProvider.System);
        (await sender.SendAsync(subscription, PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.Delivered);
        var request = fake.Calls.Single().Request;
        request.Content!.Headers.ContentEncoding.ShouldBe(["aes128gcm"]);
        var auth = request.Headers.GetValues("Authorization").Single();
        auth.ShouldStartWith("vapid t=");
        var jwt = new JsonWebToken(auth["vapid t=".Length..auth.IndexOf(',', StringComparison.Ordinal)]);
        jwt.Audiences.Single().ShouldBe("https://updates.push.services.mozilla.com");

        var gone = new WebPushSender(new HttpClient(new FakeHttp((_, _) => new HttpResponseMessage(HttpStatusCode.Gone))), options, TimeProvider.System);
        (await gone.SendAsync(subscription, PushContent.SyncNudge, TestContext.Current.CancellationToken)).ShouldBe(PushOutcome.TokenInvalid);
        (await sender.SendAsync("""{"endpoint":"http://plain.example","keys":{}}""", PushContent.SyncNudge, TestContext.Current.CancellationToken))
            .ShouldBe(PushOutcome.TokenInvalid, "only https subscriptions with real keys are used");
    }
}

public class FcmErrorTests
{
    [Theory]
    [InlineData("""{"error":{"code":404,"status":"NOT_FOUND","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}""", true)]
    [InlineData("""{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.BadRequest","fieldViolations":[{"field":"message.token","description":"Invalid registration token"}]}]}}""", true)]
    [InlineData("""{"error":{"code":404,"status":"NOT_FOUND","message":"Requested entity was not found."}}""", false)]
    [InlineData("<html>404</html>", false)]
    public void Only_FCMs_own_verdict_on_the_token_deletes_it(string body, bool dead) =>
        FcmPushSender.FcmSaysTokenIsDead(body).ShouldBe(dead);
}

public class PushStartupGuardTests
{
    [Fact]
    public void The_log_sender_is_refused_in_Production() =>
        Should.Throw<InvalidOperationException>(() => new ServiceCollection().AddNotificationInfrastructure(
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Providers:Push"] = "Log" }).Build(),
            new Env(Environments.Production))).Message.ShouldContain("dropped");

    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

public sealed class NotificationHost : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public TestTokenIssuer Issuer { get; } = new();
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public IHost Host => Factory.Services.GetRequiredService<IHost>();
    public PushLog Log => Factory.Services.GetRequiredService<PushLog>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__notification", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<IConfigurationManager<OpenIdConnectConfiguration>>();
                s.AddSingleton(Issuer.Keys);
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(PurgedProbe)));
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

/// <summary>Stands in for Identity, the real consumer of purge reports.</summary>
public static class PurgedProbe
{
    public static void Handle(UserDataPurgedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(NotificationTestGroup))]
public sealed class NotificationTestGroup : ICollectionFixture<NotificationHost>;

[Collection(nameof(NotificationTestGroup))]
public sealed class NotificationFlowTests(NotificationHost host)
{
    private async Task<(Guid Device, string Token)> Register(Guid user, string provider = "fcm", string? token = null)
    {
        var device = Guid.CreateVersion7();
        token ??= $"tok-{Guid.NewGuid():N}";
        using var key = new DeviceKey();
        using var client = host.Factory.CreateClient();
        var access = host.Issuer.Mint(user, device, key);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/push/register")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { provider, token }), Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", access);
        request.Headers.Add("DPoP", key.Proof("POST", "http://localhost/v1/push/register", access));
        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        return (device, token);
    }

    private List<(string Provider, string Token, PushMessage Message)> SentTo(params string[] tokens) =>
        [.. host.Log.Sent.Where(s => tokens.Contains(s.Token))];

    [Fact]
    public async Task A_push_from_one_device_nudges_the_others_but_not_itself()
    {
        var user = Guid.CreateVersion7();
        var phone = await Register(user);
        var laptop = await Register(user, "apns");
        var stranger = await Register(Guid.CreateVersion7());

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new RecordsPushedV1(user, phone.Device, 42));

        SentTo(laptop.Token).Single().Message.ShouldBe(PushContent.SyncNudge);
        SentTo(phone.Token).ShouldBeEmpty("the device that pushed already has its data");
        SentTo(stranger.Token).ShouldBeEmpty();
    }

    [Fact]
    public async Task Sealed_bank_data_and_credit_reports_nudge_every_device_silently()
    {
        var user = Guid.CreateVersion7();
        var phone = await Register(user);
        var laptop = await Register(user, "apns");
        var stranger = await Register(Guid.CreateVersion7());

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new PayloadSealedV1(user, Guid.CreateVersion7(), "aa.fi-bundle.v1", DateTimeOffset.UtcNow));
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new CreditReportReadyV1(user, Guid.CreateVersion7(), DateTimeOffset.UtcNow));

        SentTo(phone.Token).Select(s => s.Message).ShouldBe([PushContent.SyncNudge, PushContent.SyncNudge], "silent, and says nothing of what arrived");
        SentTo(laptop.Token).Count.ShouldBe(2);
        SentTo(stranger.Token).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_new_device_triggers_a_visible_alert_on_the_existing_ones()
    {
        var user = Guid.CreateVersion7();
        var existing = await Register(user);
        var added = await Register(user);

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new DeviceAddedV1(user, added.Device, "android", DateTimeOffset.UtcNow));

        var alert = SentTo(existing.Token).Single().Message;
        alert.Kind.ShouldBe(PushKind.NewDevice);
        alert.Body!.ShouldContain("Android");
        SentTo(added.Token).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_dead_token_is_forgotten_after_the_provider_rejects_it()
    {
        var user = Guid.CreateVersion7();
        var pusher = await Register(user);
        var dead = await Register(user, token: "dead-" + Guid.NewGuid().ToString("N"));

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new RecordsPushedV1(user, pusher.Device, 1));

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        (await db.PushTokens.AnyAsync(t => t.DeviceId == dead.Device, TestContext.Current.CancellationToken)).ShouldBeFalse();
    }

    [Fact]
    public async Task A_revoked_device_and_a_deleted_account_get_no_more_pushes()
    {
        var user = Guid.CreateVersion7();
        var a = await Register(user);
        var b = await Register(user);

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new DeviceRevokedV1(user, b.Device, DateTimeOffset.UtcNow));
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new RecordsPushedV1(user, a.Device, 7));
        SentTo(b.Token).ShouldBeEmpty();

        var purged = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, DateTimeOffset.UtcNow.AddSeconds(-1)));
        purged.Sent.SingleMessage<UserDataPurgedV1>().Service.ShouldBe("notification");
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        (await db.PushTokens.AnyAsync(t => t.UserId == user, TestContext.Current.CancellationToken)).ShouldBeFalse();
    }

    [Fact]
    public async Task One_provider_blowing_up_does_not_stop_the_others_or_the_cleanup()
    {
        var user = Guid.CreateVersion7();
        var pusher = await Register(user);
        var exploding = await Register(user, token: "boom-" + Guid.NewGuid().ToString("N"));
        var dead = await Register(user, token: "dead-" + Guid.NewGuid().ToString("N"));
        var healthy = await Register(user, "apns");

        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new RecordsPushedV1(user, pusher.Device, 9));

        SentTo(healthy.Token).ShouldHaveSingleItem();
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        (await db.PushTokens.AnyAsync(t => t.DeviceId == dead.Device, TestContext.Current.CancellationToken)).ShouldBeFalse("cleanup still saved");
        (await db.PushTokens.AnyAsync(t => t.DeviceId == exploding.Device, TestContext.Current.CancellationToken)).ShouldBeTrue("a failure is not a dead token");
    }

    [Fact]
    public async Task A_token_registered_by_another_device_moves_and_its_old_owner_stops_getting_alerts()
    {
        var shared = $"tok-{Guid.NewGuid():N}";
        var alice = Guid.CreateVersion7();
        var first = await Register(alice, token: shared);
        var bob = Guid.CreateVersion7();
        await Register(bob, token: shared);

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        (await db.PushTokens.AnyAsync(t => t.DeviceId == first.Device, TestContext.Current.CancellationToken)).ShouldBeFalse();
        (await db.PushTokens.CountAsync(t => t.Token == shared, TestContext.Current.CancellationToken)).ShouldBe(1);
    }

    [Fact]
    public async Task A_cancelled_deletion_purges_nothing()
    {
        var user = Guid.CreateVersion7();
        var device = await Register(user);
        var executeAfter = DateTimeOffset.UtcNow.AddSeconds(-1);
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(30))
            .PublishMessageAndWaitAsync(new AccountDeletionCancelledV1(user, executeAfter));
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new AccountDeletionRequestedV1(user, executeAfter));
        tracked.Sent.MessagesOf<UserDataPurgedV1>().ShouldBeEmpty();
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
        (await db.PushTokens.AnyAsync(t => t.DeviceId == device.Device, TestContext.Current.CancellationToken)).ShouldBeTrue();
    }

    [Fact]
    public async Task Malformed_registrations_are_refused()
    {
        using var key = new DeviceKey();
        using var client = host.Factory.CreateClient();
        foreach (var (provider, token) in new[] { ("carrier-pigeon", "t"), ("fcm", ""), ("fcm", "line\nbreak"), ("fcm", new string('x', 3000)) })
        {
            var access = host.Issuer.Mint(Guid.CreateVersion7(), Guid.CreateVersion7(), key);
            using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/push/register")
            {
                Content = new StringContent(JsonSerializer.Serialize(new { provider, token }), Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", access);
            request.Headers.Add("DPoP", key.Proof("POST", "http://localhost/v1/push/register", access));
            (await client.SendAsync(request, TestContext.Current.CancellationToken)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        }
    }
}
