using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Khazana.Identity.Application;
using Khazana.Identity.Application.Persistence;
using Khazana.Identity.Domain;
using Khazana.Messaging.Contracts;
using Khazana.TestKit;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.Identity.Tests;

/// <summary>
/// The real Identity service against a real Postgres and RabbitMQ in Docker.
/// Google and Apple are replaced by the Development dev provider; everything
/// else, DPoP, rotation, passkeys, the outbox, is the production code path.
/// </summary>
public sealed class TestClock : Khazana.SharedKernel.IClock
{
    public TimeSpan Offset { get; set; }
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow + Offset;
}

public sealed class IdentityHost : IAsyncLifetime
{
    public TestClock Clock { get; } = new();
    public const string Origin = "http://localhost";
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public IHost Host => Factory.Services.GetRequiredService<IHost>();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        Environment.SetEnvironmentVariable("ConnectionStrings__identity", _postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("ConnectionStrings__rabbitmq", _rabbitMq.GetConnectionString());
        Environment.SetEnvironmentVariable("Identity__Secrets__FieldKey", "integration-test-field-secret-0123456789abcdef");
        Environment.SetEnvironmentVariable("Identity__Phone__EchoCode", "true");
        Environment.SetEnvironmentVariable("Identity__Passkeys__RpId", "localhost");
        Environment.SetEnvironmentVariable("Identity__Passkeys__Origins__0", Origin);

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Development")
            .ConfigureServices(s =>
            {
                s.RemoveAll<Khazana.SharedKernel.IClock>();
                s.AddSingleton<Khazana.SharedKernel.IClock>(Clock);
                s.RemoveAll<ISmsSender>();
                s.AddSingleton<ISmsSender, ToggleSmsSender>();
                s.ConfigureWolverine(o => o.Discovery.IncludeType(typeof(IdentityEventProbe)));
            }));
        _ = Factory.Server;
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}

/// <summary>The fake sender, with a switch to make the "provider" fail.</summary>
public sealed class ToggleSmsSender(Khazana.Identity.Infrastructure.FakeSmsLog log) : ISmsSender
{
    private static volatile bool _fail;

    public static bool Fail
    {
        get => _fail;
        set => _fail = value;
    }

    public Task SendCodeAsync(string e164, string code, CancellationToken cancellationToken)
    {
        if (Fail) throw new SmsSendFailedException("Provider down.");
        log.Record(e164, code);
        return Task.CompletedTask;
    }
}

/// <summary>Stand-in consumer, so Identity's events must cross RabbitMQ to be seen.</summary>
public static class IdentityEventProbe
{
    public static void Handle(UserRegisteredV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(UserSignedInV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(AccountDeletionRequestedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(AccountDeletedV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(AccountDeletionCancelledV1 m) => ArgumentNullException.ThrowIfNull(m);
    public static void Handle(SessionEndedV1 m) => ArgumentNullException.ThrowIfNull(m);
}

[CollectionDefinition(nameof(IdentityTestGroup))]
public sealed class IdentityTestGroup : ICollectionFixture<IdentityHost>;

[Collection(nameof(IdentityTestGroup))]
public sealed class IdentityFlowTests(IdentityHost host) : IDisposable
{
    private readonly HttpClient _client = host.Factory.CreateClient();
    private readonly DeviceKey _phone = new();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // --- sign-in -------------------------------------------------------------

    [Fact]
    public async Task First_sign_in_registers_the_user_and_both_events_cross_RabbitMQ()
    {
        var subject = Unique();
        HttpResponseMessage? response = null;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                response = await _client.SendAsync(TokenRequest(_phone, $"dev:{subject}:{subject}@example.com"), Ct)));

        response!.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.ShouldBeTrue("token responses must never be cached");
        var tokens = await Json(response);
        tokens.GetProperty("token_type").GetString().ShouldBe("DPoP");
        tokens.GetProperty("expires_in").GetInt32().ShouldBe(900);
        var userId = tokens.GetProperty("user_id").GetGuid();

        tracked.Received.SingleMessage<UserRegisteredV1>().UserId.ShouldBe(userId);
        var signedIn = tracked.Received.SingleMessage<UserSignedInV1>();
        signedIn.UserId.ShouldBe(userId);
        signedIn.Platform.ShouldBe("android");

        // Signing in again is the same user on a new device session, and not a registration.
        HttpResponseMessage? again = null;
        var second = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                again = await _client.SendAsync(TokenRequest(_phone, $"dev:{subject}"), Ct)));
        var againTokens = await Json(again!);
        againTokens.GetProperty("user_id").GetGuid().ShouldBe(userId);
        againTokens.GetProperty("device_id").GetGuid().ShouldNotBe(tokens.GetProperty("device_id").GetGuid());
        second.Sent.MessagesOf<UserRegisteredV1>().ShouldBeEmpty();
        second.Sent.SingleMessage<UserSignedInV1>().UserId.ShouldBe(userId);
    }

    [Fact]
    public async Task The_database_holds_no_email_subject_or_refresh_token_in_the_clear()
    {
        var subject = Unique();
        var tokens = await SignIn(_phone, $"dev:{subject}:{subject}@example.com");
        var userId = tokens.GetProperty("user_id").GetGuid();
        var refresh = tokens.GetProperty("refresh_token").GetString()!;

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
        Encoding.UTF8.GetString(user.EmailEnc!).ShouldNotContain(subject);
        var login = await db.ExternalLogins.SingleAsync(l => l.UserId == userId, Ct);
        Encoding.UTF8.GetString(login.SubjectHash).ShouldNotContain(subject);
        var stored = await db.RefreshTokens.SingleAsync(t => t.UserId == userId, Ct);
        Encoding.ASCII.GetString(stored.TokenHash).ShouldNotBe(refresh);
        stored.Jkt.ShouldBe(_phone.Jkt);
    }

    [Fact]
    public async Task Sign_in_needs_a_valid_proof_a_known_platform_and_no_unknown_fields()
    {
        using var noProof = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/token")
        {
            Content = JsonContent.Create(new { provider = "dev", platform = "android", id_token = "dev:x" }),
        };
        var r = await _client.SendAsync(noProof, Ct);
        r.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        r.Headers.WwwAuthenticate.ToString().ShouldContain("DPoP");

        (await _client.SendAsync(TokenRequest(_phone, "dev:x", platform: "toaster"), Ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Error(await _client.SendAsync(TokenRequest(_phone, "x", provider: "facebook"), Ct))).ShouldBe("unsupported_provider");

        using var extra = TokenRequest(_phone, "dev:x");
        extra.Content = new StringContent("""{"provider":"dev","platform":"android","id_token":"dev:x","is_admin":true}""",
            Encoding.UTF8, "application/json");
        (await _client.SendAsync(extra, Ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    // --- DPoP-bound access tokens ---------------------------------------------

    [Fact]
    public async Task An_access_token_works_only_with_a_fresh_proof_from_the_device_it_was_issued_to()
    {
        var access = (await SignIn(_phone, $"dev:{Unique()}")).GetProperty("access_token").GetString()!;
        const string path = "/v1/auth/passkeys/register/options";
        using var thief = new DeviceKey();

        (await Call(path, access, _phone.Proof("POST", Url(path), access))).StatusCode.ShouldBe(HttpStatusCode.OK);

        // Copied token, sent the ordinary way.
        using (var bearer = new HttpRequestMessage(HttpMethod.Post, path))
        {
            bearer.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
            (await _client.SendAsync(bearer, Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        }
        // Copied token, with a proof from the thief's own key.
        (await Call(path, access, thief.Proof("POST", Url(path), access))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        // No proof, a proof for another endpoint, a proof without the token hash.
        (await Call(path, access, null)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Call(path, access, _phone.Proof("POST", Url("/v1/auth/logout"), access))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Call(path, access, _phone.Proof("POST", Url(path)))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        // A captured request replayed as-is.
        var proof = _phone.Proof("POST", Url(path), access);
        (await Call(path, access, proof)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Call(path, access, proof)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    // --- refresh rotation -----------------------------------------------------

    [Fact]
    public async Task Refresh_rotates_and_a_reused_token_ends_the_whole_session()
    {
        var first = (await SignIn(_phone, $"dev:{Unique()}")).GetProperty("refresh_token").GetString()!;
        var second = await RefreshOk(_phone, first);
        second.ShouldNotBe(first);

        // The old token again: a copy exists somewhere. Everything in the session dies,
        // including the newest token the real device holds.
        (await Error(await Refresh(_phone, first))).ShouldBe("invalid_grant");
        (await Error(await Refresh(_phone, second))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task A_refresh_token_presented_with_another_devices_key_ends_the_session()
    {
        var token = (await SignIn(_phone, $"dev:{Unique()}")).GetProperty("refresh_token").GetString()!;
        using var thief = new DeviceKey();
        (await Error(await Refresh(thief, token))).ShouldBe("invalid_grant");
        (await Error(await Refresh(_phone, token))).ShouldBe("invalid_grant", "the session was revoked, not just the thief's request");
    }

    [Fact]
    public async Task Two_refreshes_racing_with_one_token_cannot_both_win()
    {
        var token = (await SignIn(_phone, $"dev:{Unique()}")).GetProperty("refresh_token").GetString()!;
        var results = await Task.WhenAll(Refresh(_phone, token), Refresh(_phone, token));
        results.Count(r => r.StatusCode == HttpStatusCode.OK).ShouldBeLessThanOrEqualTo(1);
    }

    // --- logout and deletion --------------------------------------------------

    [Fact]
    public async Task Logout_ends_this_device_and_everywhere_ends_every_device()
    {
        var subject = $"dev:{Unique()}";
        using var laptop = new DeviceKey();
        using var tablet = new DeviceKey();
        var phone = await SignIn(_phone, subject);
        var lap = await SignIn(laptop, subject);
        var tab = await SignIn(tablet, subject);

        await Logout(_phone, phone, everywhere: false);
        (await Refresh(_phone, phone.GetProperty("refresh_token").GetString()!)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var lapRefresh = await RefreshOk(laptop, lap.GetProperty("refresh_token").GetString()!);

        await Logout(tablet, tab, everywhere: true);
        (await Refresh(laptop, lapRefresh)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Deletion_revokes_everything_publishes_one_event_and_blocks_sign_in()
    {
        var subject = $"dev:{Unique()}";
        var tokens = await SignIn(_phone, subject);
        var access = tokens.GetProperty("access_token").GetString()!;

        HttpResponseMessage? response = null;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
            {
                using var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account");
                Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
                response = await _client.SendAsync(delete, Ct);
            }));

        response!.StatusCode.ShouldBe(HttpStatusCode.Accepted);
        var requested = tracked.Received.SingleMessage<AccountDeletionRequestedV1>();
        requested.UserId.ShouldBe(tokens.GetProperty("user_id").GetGuid());
        (requested.ExecuteAfter - DateTimeOffset.UtcNow).ShouldBeGreaterThan(TimeSpan.FromHours(23));

        (await Error(await Refresh(_phone, tokens.GetProperty("refresh_token").GetString()!))).ShouldBe("invalid_grant");
        (await Error(await _client.SendAsync(TokenRequest(_phone, subject), Ct))).ShouldBe("account_deletion_pending");
    }

    [Fact]
    public async Task A_device_revoked_in_Devices_and_Keys_loses_its_session_here()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new DeviceRevokedV1(
                tokens.GetProperty("user_id").GetGuid(), tokens.GetProperty("device_id").GetGuid(), DateTimeOffset.UtcNow));
        (await Error(await Refresh(_phone, tokens.GetProperty("refresh_token").GetString()!))).ShouldBe("invalid_grant");
    }

    // --- fixes from the 2026-10-22 review ------------------------------------

    [Fact]
    public async Task A_logout_racing_a_refresh_still_kills_the_token_the_refresh_issued()
    {
        for (var round = 0; round < 8; round++)
        {
            var tokens = await SignIn(_phone, $"dev:{Unique()}");
            var access = tokens.GetProperty("access_token").GetString()!;
            var refreshing = Refresh(_phone, tokens.GetProperty("refresh_token").GetString()!);
            var loggingOut = Call("/v1/auth/logout", access, _phone.Proof("POST", Url("/v1/auth/logout"), access),
                new JsonObject { ["everywhere"] = true });
            await Task.WhenAll(refreshing, loggingOut);
            var refreshed = await refreshing;
            if (refreshed.StatusCode != HttpStatusCode.OK) continue; // the logout went first: nothing to leak
            var newToken = (await Json(refreshed)).GetProperty("refresh_token").GetString()!;
            (await Error(await Refresh(_phone, newToken))).ShouldBe("invalid_grant", $"round {round}: the logout must reach the token minted during it");
        }
    }

    [Fact]
    public async Task Logout_tells_Devices_and_Keys_that_the_session_ended()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var access = tokens.GetProperty("access_token").GetString()!;
        HttpResponseMessage? response = null;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                response = await Call("/v1/auth/logout", access, _phone.Proof("POST", Url("/v1/auth/logout"), access), new JsonObject { ["everywhere"] = false })));
        response!.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        tracked.Received.SingleMessage<SessionEndedV1>().DeviceId.ShouldBe(tokens.GetProperty("device_id").GetGuid());
    }

    [Fact]
    public async Task A_logged_out_token_cannot_add_a_passkey_and_a_stale_sign_in_must_sign_in_again()
    {
        const string path = "/v1/auth/passkeys/register/options";
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var access = tokens.GetProperty("access_token").GetString()!;

        host.Clock.Offset = SessionService.FreshSignIn + TimeSpan.FromMinutes(1);
        try
        {
            var stale = await Call(path, access, _phone.Proof("POST", Url(path), access));
            stale.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
            (await Json(stale)).GetProperty("error").GetString().ShouldBe("reauthentication_required");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }

        await Call("/v1/auth/logout", access, _phone.Proof("POST", Url("/v1/auth/logout"), access), new JsonObject { ["everywhere"] = false });
        var revoked = await Call(path, access, _phone.Proof("POST", Url(path), access));
        revoked.StatusCode.ShouldBe(HttpStatusCode.Unauthorized, "the access token hasn't expired, but its session has");
    }

    [Fact]
    public async Task Two_deletion_requests_at_once_both_succeed_and_announce_once()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var access = tokens.GetProperty("access_token").GetString()!;
        HttpResponseMessage[] responses = [];
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
            {
                async Task<HttpResponseMessage> Delete()
                {
                    using var request = new HttpRequestMessage(HttpMethod.Delete, "/v1/account");
                    Authorize(request, access, _phone.Proof("DELETE", Url("/v1/account"), access));
                    return await _client.SendAsync(request, Ct);
                }
                responses = await Task.WhenAll(Delete(), Delete());
            }));
        responses.Count(r => r.StatusCode == HttpStatusCode.Accepted).ShouldBeGreaterThanOrEqualTo(1);
        responses.ShouldAllBe(r => (int)r.StatusCode < 500, "a double tap is never a server error");
        tracked.Sent.MessagesOf<AccountDeletionRequestedV1>().Count().ShouldBe(1);
    }

    [Fact]
    public async Task A_user_can_restore_their_account_during_the_cooling_off_but_not_after()
    {
        var subject = $"dev:{Unique()}";
        var tokens = await SignIn(_phone, subject);
        var access = tokens.GetProperty("access_token").GetString()!;
        using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
        {
            Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
            (await _client.SendAsync(delete, Ct)).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        }
        (await Error(await _client.SendAsync(TokenRequest(_phone, subject), Ct))).ShouldBe("account_deletion_pending");

        HttpResponseMessage? restored = null;
        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ =>
                restored = await _client.SendAsync(RestoreRequest(_phone, subject), Ct)));
        restored!.StatusCode.ShouldBe(HttpStatusCode.OK);
        tracked.Received.SingleMessage<AccountDeletionCancelledV1>().UserId.ShouldBe(tokens.GetProperty("user_id").GetGuid());
        (await _client.SendAsync(TokenRequest(_phone, subject), Ct)).StatusCode.ShouldBe(HttpStatusCode.OK, "an ordinary sign-in works again");

        // Delete again and wait out the cooling-off: now it's final.
        var again = (await SignIn(_phone, subject)).GetProperty("access_token").GetString()!;
        using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
        {
            Authorize(delete, again, _phone.Proof("DELETE", Url("/v1/account"), again));
            await _client.SendAsync(delete, Ct);
        }
        host.Clock.Offset = Khazana.Identity.Domain.AccountDeletion.CoolingOff + TimeSpan.FromMinutes(1);
        try
        {
            (await Error(await _client.SendAsync(RestoreRequest(_phone, subject), Ct))).ShouldBe("deletion_in_progress");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
    }

    [Fact]
    public async Task Two_first_sign_ins_with_one_account_at_once_make_one_user()
    {
        var subject = $"dev:{Unique()}";
        using var other = new DeviceKey();
        var results = await Task.WhenAll(_client.SendAsync(TokenRequest(_phone, subject), Ct), _client.SendAsync(TokenRequest(other, subject), Ct));
        results.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        var users = await Task.WhenAll(results.Select(Json));
        users[0].GetProperty("user_id").GetGuid().ShouldBe(users[1].GetProperty("user_id").GetGuid());
    }

    [Fact]
    public async Task A_body_with_a_missing_required_field_is_a_400_not_a_crash()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/token")
        {
            Content = new StringContent("""{"platform":"ios"}""", Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("DPoP", _phone.Proof("POST", Url("/v1/auth/token")));
        (await _client.SendAsync(request, Ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    private static HttpRequestMessage RestoreRequest(DeviceKey device, string idToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/account/restore")
        {
            Content = JsonContent.Create(new Dictionary<string, object> { ["provider"] = "dev", ["platform"] = "ios", ["id_token"] = idToken }),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url("/v1/account/restore")));
        return request;
    }

    [Fact]
    public async Task The_user_is_deleted_last_only_after_every_service_confirms_its_purge()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var userId = tokens.GetProperty("user_id").GetGuid();
        var access = tokens.GetProperty("access_token").GetString()!;
        using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
        {
            Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
            (await _client.SendAsync(delete, Ct)).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        }

        async Task<ITrackedSession> Purged(string service) =>
            await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
                .PublishMessageAndWaitAsync(new UserDataPurgedV1(userId, service, DateTimeOffset.UtcNow));

        (await Purged("devices")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty();
        (await Purged("devices")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty("a duplicate confirmation counts once");
        (await Purged("sync")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty();
        await UserStillExists(userId, true);

        (await Purged("notification")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty();
        (await Purged("aa")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty("bank-data consents and sealed payloads must go first");
        (await Purged("credit")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty();
        var last = await Purged("reporting");
        last.Sent.SingleMessage<AccountDeletedV1>().UserId.ShouldBe(userId);
        await UserStillExists(userId, false);

        (await Purged("sync")).Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty("a late confirmation changes nothing");
    }

    [Fact]
    public async Task Every_services_confirmations_arriving_together_delete_the_user_exactly_once()
    {
        for (var round = 0; round < 3; round++)
        {
            var tokens = await SignIn(_phone, $"dev:{Unique()}");
            var userId = tokens.GetProperty("user_id").GetGuid();
            var access = tokens.GetProperty("access_token").GetString()!;
            using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
            {
                Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
                (await _client.SendAsync(delete, Ct)).StatusCode.ShouldBe(HttpStatusCode.Accepted);
            }

            var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
                .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async bus =>
                {
                    foreach (var service in AllServices)
                        await bus.PublishAsync(new UserDataPurgedV1(userId, service, DateTimeOffset.UtcNow));
                }));

            tracked.Sent.MessagesOf<AccountDeletedV1>().Count().ShouldBe(1, $"round {round}");
            await UserStillExists(userId, false);
        }
    }

    [Fact]
    public async Task Restoring_clears_the_saga_so_later_confirmations_delete_nothing()
    {
        var subject = $"dev:{Unique()}";
        var tokens = await SignIn(_phone, subject);
        var userId = tokens.GetProperty("user_id").GetGuid();
        var access = tokens.GetProperty("access_token").GetString()!;
        using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
        {
            Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
            await _client.SendAsync(delete, Ct);
        }
        (await _client.SendAsync(RestoreRequest(_phone, subject), Ct)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async bus =>
            {
                foreach (var service in AllServices)
                    await bus.PublishAsync(new UserDataPurgedV1(userId, service, DateTimeOffset.UtcNow));
            }));
        tracked.Sent.MessagesOf<AccountDeletedV1>().ShouldBeEmpty();
        await UserStillExists(userId, true);
    }

    [Fact]
    public async Task A_deletion_a_service_never_confirms_is_reported_as_overdue()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var userId = tokens.GetProperty("user_id").GetGuid();
        var access = tokens.GetProperty("access_token").GetString()!;
        using (var delete = new HttpRequestMessage(HttpMethod.Delete, "/v1/account"))
        {
            Authorize(delete, access, _phone.Proof("DELETE", Url("/v1/account"), access));
            await _client.SendAsync(delete, Ct);
        }
        await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .PublishMessageAndWaitAsync(new UserDataPurgedV1(userId, "devices", DateTimeOffset.UtcNow));

        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<Khazana.Identity.Application.DeletionSettings>();
        var later = DateTimeOffset.UtcNow + Khazana.Identity.Domain.AccountDeletion.CoolingOff + Khazana.Identity.Api.DeletionOverdueCheck.Grace + TimeSpan.FromHours(1);
        var overdue = await Khazana.Identity.Api.DeletionOverdueCheck.FindOverdueAsync(db, settings, later, Ct);
        overdue.Single(o => o.UserId == userId).Missing.ShouldBe(["sync", "notification", "reporting", "aa", "credit"]);
        (await Khazana.Identity.Api.DeletionOverdueCheck.FindOverdueAsync(db, settings, DateTimeOffset.UtcNow, Ct))
            .ShouldNotContain(o => o.UserId == userId, "not overdue during the cooling-off");
    }

    private async Task UserStillExists(Guid userId, bool expected)
    {
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        (await db.Users.AnyAsync(u => u.Id == userId, Ct)).ShouldBe(expected);
        if (!expected)
        {
            (await db.ExternalLogins.AnyAsync(l => l.UserId == userId, Ct)).ShouldBeFalse();
            (await db.RefreshTokens.AnyAsync(t => t.UserId == userId, Ct)).ShouldBeFalse();
        }
    }

    // --- passkeys -------------------------------------------------------------

    [Fact]
    public async Task A_passkey_added_while_signed_in_then_signs_in_on_its_own()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var access = tokens.GetProperty("access_token").GetString()!;
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);

        // Register.
        const string optionsPath = "/v1/auth/passkeys/register/options";
        var registerOptions = await Json(await Call(optionsPath, access, _phone.Proof("POST", Url(optionsPath), access)));
        var attestation = authenticator.Create(registerOptions.GetProperty("options"));
        const string registerPath = "/v1/auth/passkeys/register";
        var body = new JsonObject
        {
            ["challenge_id"] = registerOptions.GetProperty("challenge_id").GetGuid().ToString(),
            ["attestation"] = attestation,
        };
        (await Call(registerPath, access, _phone.Proof("POST", Url(registerPath), access), body)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // Sign in with it, on a new device key, with no Google or Apple involved.
        using var newPhone = new DeviceKey();
        var signedIn = await PasskeySignIn(newPhone, authenticator);
        signedIn.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(signedIn)).GetProperty("user_id").GetGuid().ShouldBe(tokens.GetProperty("user_id").GetGuid());

        // A cloned authenticator shows up as a signature counter going backwards.
        authenticator.SignCount = 0;
        (await Error(await PasskeySignIn(newPhone, authenticator))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task Step_up_needs_the_accounts_own_passkey_and_returns_a_two_minute_token_with_no_refresh_token()
    {
        var tokens = await SignIn(_phone, $"dev:{Unique()}");
        var access = tokens.GetProperty("access_token").GetString()!;
        using var mine = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        await AddPasskey(_phone, access, mine);

        var stepped = await StepUp(_phone, access, mine);
        stepped.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await Json(stepped);
        body.TryGetProperty("refresh_token", out _).ShouldBeFalse();
        body.GetProperty("expires_in").GetInt32().ShouldBe(120);
        var jwt = new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(body.GetProperty("access_token").GetString()!);
        jwt.Claims.ShouldContain(c => c.Type == "sua");
        jwt.Claims.Single(c => c.Type == "sub").Value.ShouldBe(tokens.GetProperty("user_id").GetString());
        jwt.Claims.Single(c => c.Type == "did").Value.ShouldBe(tokens.GetProperty("device_id").GetString());

        // A normal access token never carries the claim.
        new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(access).Claims.ShouldNotContain(c => c.Type == "sua");

        // Another account's passkey proves nothing about this one.
        using var theirs = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        using var theirPhone = new DeviceKey();
        var theirSession = await SignIn(theirPhone, $"dev:{Unique()}");
        await AddPasskey(theirPhone, theirSession.GetProperty("access_token").GetString()!, theirs);
        (await Error(await StepUp(_phone, access, theirs))).ShouldBe("invalid_grant");

        // Without a signed-in session there is no step-up at all.
        const string path = "/v1/auth/step-up/options";
        (await Call(path, access, null)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_passkey_challenge_answers_once()
    {
        var options = await Json(await _client.PostAsync(new Uri("/v1/auth/passkeys/assert/options", UriKind.Relative), null, Ct));
        var challengeId = options.GetProperty("challenge_id").GetGuid();
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        var assertion = authenticator.Get(options.GetProperty("options"));

        // Unknown credential: refused, and the challenge is spent either way.
        (await Error(await _client.SendAsync(PasskeyRequest(_phone, challengeId, assertion), Ct))).ShouldBe("invalid_grant");
        (await Error(await _client.SendAsync(PasskeyRequest(_phone, challengeId, assertion), Ct))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task A_passkey_alone_creates_an_account_that_then_signs_in()
    {
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        var created = await PasskeySignUp(_phone, authenticator);
        created.StatusCode.ShouldBe(HttpStatusCode.OK);
        var tokens = await Json(created);
        var userId = tokens.GetProperty("user_id").GetGuid();
        tokens.GetProperty("token_type").GetString().ShouldBe("DPoP");

        // The same passkey signs in later, on another device key: same account.
        using var laptop = new DeviceKey();
        var signedIn = await PasskeySignIn(laptop, authenticator);
        signedIn.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(signedIn)).GetProperty("user_id").GetGuid().ShouldBe(userId);

        // And the new account works like any other: its refresh token rotates.
        (await Refresh(_phone, tokens.GetProperty("refresh_token").GetString()!)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_sign_up_challenge_answers_once()
    {
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        var options = await Json(await _client.PostAsync(new Uri("/v1/auth/passkeys/signup/options", UriKind.Relative), null, Ct));
        var challengeId = options.GetProperty("challenge_id").GetGuid();
        var attestation = authenticator.Create(options.GetProperty("options"));
        (await _client.SendAsync(SignUpRequest(_phone, challengeId, attestation), Ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        // A different authenticator answering the same challenge: only single use stops it.
        using var other = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        var second = other.Create(options.GetProperty("options"));
        (await Error(await _client.SendAsync(SignUpRequest(_phone, challengeId, second), Ct))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task One_passkey_cannot_create_two_accounts()
    {
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        (await PasskeySignUp(_phone, authenticator)).StatusCode.ShouldBe(HttpStatusCode.OK);
        // A second sign-up answered by the same credential: refused, no second user.
        (await Error(await PasskeySignUp(_phone, authenticator))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task A_sign_up_answer_for_another_site_is_refused()
    {
        using var phishing = new SoftwareAuthenticator("localhost", "https://khazana.evil.test");
        (await Error(await PasskeySignUp(_phone, phishing))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task Sign_up_is_not_accepted_as_a_restore()
    {
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        var options = await Json(await _client.PostAsync(new Uri("/v1/auth/passkeys/signup/options", UriKind.Relative), null, Ct));
        using var request = SignUpRequest(_phone, options.GetProperty("challenge_id").GetGuid(),
            authenticator.Create(options.GetProperty("options")), "/v1/account/restore");
        (await Error(await _client.SendAsync(request, Ct))).ShouldBe("unsupported_provider");
    }

    [Fact]
    public async Task Concurrent_sign_ups_each_get_their_own_account()
    {
        var authenticators = Enumerable.Range(0, 4).Select(_ => new SoftwareAuthenticator("localhost", IdentityHost.Origin)).ToList();
        try
        {
            var devices = authenticators.Select(_ => new DeviceKey()).ToList();
            var responses = await Task.WhenAll(authenticators.Select((a, i) => PasskeySignUp(devices[i], a)));
            responses.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
            var ids = await Task.WhenAll(responses.Select(async r => (await Json(r)).GetProperty("user_id").GetGuid()));
            ids.Distinct().Count().ShouldBe(4);
            devices.ForEach(d => d.Dispose());
        }
        finally
        {
            authenticators.ForEach(a => a.Dispose());
        }
    }

    // --- discovery ------------------------------------------------------------

    [Fact]
    public async Task The_JWKS_publishes_a_public_EC_key_and_nothing_private()
    {
        var jwks = await Json(await _client.GetAsync(new Uri("/.well-known/jwks.json", UriKind.Relative), Ct));
        var key = jwks.GetProperty("keys")[0];
        key.GetProperty("kty").GetString().ShouldBe("EC");
        key.GetProperty("alg").GetString().ShouldBe("ES256");
        key.TryGetProperty("d", out _).ShouldBeFalse();
    }

    // --- helpers --------------------------------------------------------------

    private static readonly string[] AllServices = ["devices", "sync", "notification", "reporting", "aa", "credit"];

    // --- mobile number (SMS code) --------------------------------------------

    private static string NewPhone() => "+9198" + Random.Shared.Next(0, 100_000_000).ToString("D8", System.Globalization.CultureInfo.InvariantCulture);

    private static HttpRequestMessage PhoneStartRequest(DeviceKey device, string phone, string platform = "android")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/phone/start")
        {
            Content = JsonContent.Create(new Dictionary<string, object> { ["phone"] = phone, ["platform"] = platform }),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url("/v1/auth/phone/start")));
        return request;
    }

    private async Task<HttpResponseMessage> PhoneStart(DeviceKey device, string phone)
    {
        using var request = PhoneStartRequest(device, phone);
        return await _client.SendAsync(request, Ct);
    }

    private async Task<(Guid Id, string Code)> PhoneChallenge(DeviceKey device, string phone)
    {
        var response = await PhoneStart(device, phone);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var body = await Json(response);
        return (body.GetProperty("challenge_id").GetGuid(), body.GetProperty("demo_code").GetString()!);
    }

    private async Task<HttpResponseMessage> PhoneVerify(DeviceKey device, Guid challenge, string code, string path = "/v1/auth/token")
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(new Dictionary<string, object>
            {
                ["provider"] = "phone", ["platform"] = "android", ["challenge_id"] = challenge, ["code"] = code,
            }),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url(path)));
        return await _client.SendAsync(request, Ct);
    }

    private static string WrongCode(string code) => code == "000000" ? "000001" : "000000";

    private async Task ClearPhoneLimits() =>
        await host.Factory.Services.CreateAsyncScope().ServiceProvider.GetRequiredService<IdentityDbContext>()
            .PhoneOtpChallenges.ExecuteDeleteAsync(Ct);

    [Fact]
    public async Task A_texted_code_signs_the_number_in_and_signing_in_again_is_the_same_user()
    {
        var phone = NewPhone();
        HttpResponseMessage? response = null;
        var (id, code) = await PhoneChallenge(_phone, phone);
        host.Factory.Services.GetRequiredService<Khazana.Identity.Infrastructure.FakeSmsLog>().Sent
            .ShouldContain(x => x.Phone == phone && x.Code == code, "the fake sender got the same code the demo echoes");

        var tracked = await host.Host.TrackActivity().IncludeExternalTransports().Timeout(TimeSpan.FromSeconds(60))
            .ExecuteAndWaitAsync((Func<IMessageContext, Task>)(async _ => response = await PhoneVerify(_phone, id, code)));
        response!.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Headers.CacheControl!.NoStore.ShouldBeTrue();
        var tokens = await Json(response);
        var userId = tokens.GetProperty("user_id").GetGuid();
        tracked.Received.SingleMessage<UserRegisteredV1>().UserId.ShouldBe(userId);
        tracked.Received.SingleMessage<UserSignedInV1>().UserId.ShouldBe(userId);

        await ClearPhoneLimits();
        using var other = new DeviceKey();
        var (id2, code2) = await PhoneChallenge(other, phone);
        var again = await Json(await PhoneVerify(other, id2, code2));
        again.GetProperty("user_id").GetGuid().ShouldBe(userId);

        // The number is stored only as a keyed hash.
        await using var scope = host.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var login = await db.ExternalLogins.SingleAsync(x => x.UserId == userId && x.Provider == "phone", Ct);
        Encoding.UTF8.GetString(login.SubjectHash).ShouldNotContain(phone);
        var challenge = await db.PhoneOtpChallenges.SingleAsync(x => x.Id == id2, Ct);
        BitConverter.ToString(challenge.CodeHash).ShouldNotContain(code2);
        Encoding.UTF8.GetString(challenge.PhoneEnc).ShouldNotContain(phone);
        challenge.CodeHash.Length.ShouldBe(32, "an HMAC, not the code");
    }

    [Fact]
    public async Task A_phone_session_refreshes_like_any_other()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        var tokens = await Json(await PhoneVerify(_phone, id, code));
        await RefreshOk(_phone, tokens.GetProperty("refresh_token").GetString()!);
    }

    [Fact]
    public async Task A_wrong_code_is_refused_and_five_wrong_tries_burn_the_code_even_for_the_right_one()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        for (var i = 0; i < PhoneOtpRules.MaxVerifyAttempts; i++)
            (await Error(await PhoneVerify(_phone, id, WrongCode(code)))).ShouldBe("invalid_grant");
        (await Error(await PhoneVerify(_phone, id, code))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task A_code_works_once()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        (await PhoneVerify(_phone, id, code)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Error(await PhoneVerify(_phone, id, code))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task An_expired_code_is_refused()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        host.Clock.Offset = PhoneOtpRules.Lifetime + TimeSpan.FromSeconds(1);
        try
        {
            (await Error(await PhoneVerify(_phone, id, code))).ShouldBe("invalid_grant");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
    }

    [Fact]
    public async Task A_code_cannot_be_answered_from_another_device_key()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        using var thief = new DeviceKey();
        (await Error(await PhoneVerify(thief, id, code))).ShouldBe("invalid_grant");
        (await PhoneVerify(_phone, id, code)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_malformed_code_or_unknown_challenge_is_refused()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        (await Error(await PhoneVerify(_phone, id, "12"))).ShouldBe("invalid_request");
        (await Error(await PhoneVerify(_phone, id, "12345a"))).ShouldBe("invalid_request");
        (await Error(await PhoneVerify(_phone, Guid.NewGuid(), code))).ShouldBe("invalid_grant");
        using var noChallenge = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/token")
        {
            Content = JsonContent.Create(new Dictionary<string, object> { ["provider"] = "phone", ["platform"] = "android", ["code"] = code }),
        };
        noChallenge.Headers.Add("DPoP", _phone.Proof("POST", Url("/v1/auth/token")));
        (await Error(await _client.SendAsync(noChallenge, Ct))).ShouldBe("invalid_request");
    }

    [Fact]
    public async Task Asking_for_a_code_answers_the_same_for_a_known_and_an_unknown_number()
    {
        var known = NewPhone();
        var (id, code) = await PhoneChallenge(_phone, known);
        (await PhoneVerify(_phone, id, code)).StatusCode.ShouldBe(HttpStatusCode.OK);

        await ClearPhoneLimits();
        using var a = new DeviceKey();
        using var b = new DeviceKey();
        var forKnown = await Json(await PhoneStart(a, known));
        var forUnknown = await Json(await PhoneStart(b, NewPhone()));
        forKnown.EnumerateObject().Select(p => p.Name).OrderBy(x => x)
            .ShouldBe(forUnknown.EnumerateObject().Select(p => p.Name).OrderBy(x => x));
        forKnown.GetProperty("expires_in").GetInt32().ShouldBe(forUnknown.GetProperty("expires_in").GetInt32());
        forKnown.GetProperty("resend_after").GetInt32().ShouldBe(forUnknown.GetProperty("resend_after").GetInt32());
    }

    [Fact]
    public async Task Only_allowed_numbers_get_a_text_and_the_request_needs_a_proof_and_a_known_platform()
    {
        (await Error(await PhoneStart(_phone, "+14155550123"))).ShouldBe("invalid_phone");
        (await Error(await PhoneStart(_phone, "12345"))).ShouldBe("invalid_phone");
        using var badPlatform = PhoneStartRequest(_phone, NewPhone(), platform: "toaster");
        (await Error(await _client.SendAsync(badPlatform, Ct))).ShouldBe("invalid_request");
        using var noProof = PhoneStartRequest(_phone, NewPhone());
        noProof.Headers.Remove("DPoP");
        (await _client.SendAsync(noProof, Ct)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_number_gets_one_text_per_thirty_seconds_three_per_fifteen_minutes_and_ten_a_day()
    {
        var phone = NewPhone();
        await PhoneChallenge(_phone, phone);
        // Resend cooldown, with a Retry-After.
        using var second = await PhoneStart(_phone, phone);
        second.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        second.Headers.RetryAfter!.Delta!.Value.TotalSeconds.ShouldBeInRange(1, 30);
        (await Json(second)).GetProperty("error").GetString().ShouldBe("too_many_requests");

        // Third inside fifteen minutes is allowed; the fourth is not.
        host.Clock.Offset = TimeSpan.FromSeconds(31);
        try
        {
            await PhoneChallenge(_phone, phone);
            host.Clock.Offset = TimeSpan.FromSeconds(62);
            await PhoneChallenge(_phone, phone);
            host.Clock.Offset = TimeSpan.FromSeconds(93);
            (await PhoneStart(_phone, phone)).StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);

            // After fifteen minutes texts resume: three more per window, ten in all per day.
            var sent = 3;
            for (var batch = 1; sent < PhoneOtpRules.PerPhoneDayLimit; batch++)
            {
                for (var i = 0; i < PhoneOtpRules.PerPhoneWindowLimit && sent < PhoneOtpRules.PerPhoneDayLimit; i++)
                {
                    host.Clock.Offset = TimeSpan.FromMinutes(17 * batch) + TimeSpan.FromSeconds(31 * i);
                    await PhoneChallenge(_phone, phone);
                    sent++;
                }
            }
            host.Clock.Offset += TimeSpan.FromSeconds(31);
            (await PhoneStart(_phone, phone)).StatusCode.ShouldBe(HttpStatusCode.TooManyRequests, "the daily cap of ten");
        }
        finally
        {
            host.Clock.Offset = TimeSpan.Zero;
        }
    }

    [Fact]
    public async Task One_device_key_cannot_spray_texts_at_many_numbers()
    {
        using var sprayer = new DeviceKey();
        for (var i = 0; i < PhoneOtpRules.PerDeviceWindowLimit; i++) await PhoneChallenge(sprayer, NewPhone());
        (await PhoneStart(sprayer, NewPhone())).StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task A_provider_failure_is_a_503_and_does_not_count_against_the_number()
    {
        var phone = NewPhone();
        ToggleSmsSender.Fail = true;
        try
        {
            (await PhoneStart(_phone, phone)).StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        }
        finally
        {
            ToggleSmsSender.Fail = false;
        }
        await PhoneChallenge(_phone, phone);
    }

    [Fact]
    public async Task A_phone_session_can_never_pass_step_up_and_cannot_use_a_code_as_a_passkey()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        var tokens = await Json(await PhoneVerify(_phone, id, code));
        var access = tokens.GetProperty("access_token").GetString()!;
        new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(access).Claims.ShouldNotContain(c => c.Type == "sua");

        // Step-up takes a passkey assertion for this account and nothing else.
        const string path = "/v1/auth/step-up";
        (await Call(path, access, _phone.Proof("POST", Url(path), access),
            new JsonObject { ["challenge_id"] = id.ToString(), ["code"] = code })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Error(await Call(path, access, _phone.Proof("POST", Url(path), access),
            new JsonObject { ["challenge_id"] = id.ToString(), ["assertion"] = new JsonObject() }))).ShouldBe("invalid_request");

        // With no passkey on the account, even a real passkey assertion is refused.
        using var stranger = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        (await Error(await StepUp(_phone, access, stranger))).ShouldBe("invalid_grant");
    }

    [Fact]
    public async Task A_phone_user_can_add_a_passkey_while_the_sign_in_is_fresh_then_sign_in_with_it()
    {
        var (id, code) = await PhoneChallenge(_phone, NewPhone());
        var tokens = await Json(await PhoneVerify(_phone, id, code));
        using var authenticator = new SoftwareAuthenticator("localhost", IdentityHost.Origin);
        await AddPasskey(_phone, tokens.GetProperty("access_token").GetString()!, authenticator);
        using var another = new DeviceKey();
        var signedIn = await PasskeySignIn(another, authenticator);
        signedIn.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(signedIn)).GetProperty("user_id").GetGuid().ShouldBe(tokens.GetProperty("user_id").GetGuid());
    }

    [Fact]
    public async Task Restore_accepts_a_texted_code_too()
    {
        var phone = NewPhone();
        var (id, code) = await PhoneChallenge(_phone, phone);
        var tokens = await Json(await PhoneVerify(_phone, id, code));
        var access = tokens.GetProperty("access_token").GetString()!;
        using var del = new HttpRequestMessage(HttpMethod.Delete, "/v1/account");
        Authorize(del, access, _phone.Proof("DELETE", Url("/v1/account"), access));
        (await _client.SendAsync(del, Ct)).StatusCode.ShouldBe(HttpStatusCode.Accepted);

        await ClearPhoneLimits();
        using var other = new DeviceKey();
        var (id2, code2) = await PhoneChallenge(other, phone);
        (await Error(await PhoneVerify(other, id2, code2))).ShouldBe("account_deletion_pending");
        await ClearPhoneLimits();
        var (id3, code3) = await PhoneChallenge(other, phone);
        (await PhoneVerify(other, id3, code3, "/v1/account/restore")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    private static string Unique() => Guid.NewGuid().ToString("N")[..12];

    private static string Url(string path) => IdentityHost.Origin + path;

    private static HttpRequestMessage TokenRequest(DeviceKey device, string idToken, string provider = "dev", string platform = "android")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/token")
        {
            Content = JsonContent.Create(new Dictionary<string, object> { ["provider"] = provider, ["platform"] = platform, ["id_token"] = idToken }),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url("/v1/auth/token")));
        return request;
    }

    private static HttpRequestMessage PasskeyRequest(DeviceKey device, Guid challengeId, JsonObject assertion)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/token")
        {
            Content = new StringContent(new JsonObject
            {
                ["provider"] = "passkey", ["platform"] = "ios",
                ["challenge_id"] = challengeId.ToString(), ["assertion"] = assertion.DeepClone(),
            }.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url("/v1/auth/token")));
        return request;
    }

    private static HttpRequestMessage SignUpRequest(DeviceKey device, Guid challengeId, JsonObject attestation, string path = "/v1/auth/token")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(new JsonObject
            {
                ["provider"] = "passkey_signup", ["platform"] = "web",
                ["challenge_id"] = challengeId.ToString(), ["attestation"] = attestation.DeepClone(),
            }.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url(path)));
        return request;
    }

    private async Task<HttpResponseMessage> PasskeySignUp(DeviceKey device, SoftwareAuthenticator authenticator)
    {
        var options = await Json(await _client.PostAsync(new Uri("/v1/auth/passkeys/signup/options", UriKind.Relative), null, Ct));
        var attestation = authenticator.Create(options.GetProperty("options"));
        using var request = SignUpRequest(device, options.GetProperty("challenge_id").GetGuid(), attestation);
        return await _client.SendAsync(request, Ct);
    }

    private async Task AddPasskey(DeviceKey device, string access, SoftwareAuthenticator authenticator)
    {
        const string optionsPath = "/v1/auth/passkeys/register/options";
        var options = await Json(await Call(optionsPath, access, device.Proof("POST", Url(optionsPath), access)));
        const string registerPath = "/v1/auth/passkeys/register";
        var body = new JsonObject
        {
            ["challenge_id"] = options.GetProperty("challenge_id").GetGuid().ToString(),
            ["attestation"] = authenticator.Create(options.GetProperty("options")),
        };
        (await Call(registerPath, access, device.Proof("POST", Url(registerPath), access), body)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    private async Task<HttpResponseMessage> StepUp(DeviceKey device, string access, SoftwareAuthenticator authenticator)
    {
        const string optionsPath = "/v1/auth/step-up/options";
        var options = await Json(await Call(optionsPath, access, device.Proof("POST", Url(optionsPath), access)));
        const string path = "/v1/auth/step-up";
        var body = new JsonObject
        {
            ["challenge_id"] = options.GetProperty("challenge_id").GetGuid().ToString(),
            ["assertion"] = authenticator.Get(options.GetProperty("options")),
        };
        return await Call(path, access, device.Proof("POST", Url(path), access), body);
    }

    private async Task<HttpResponseMessage> PasskeySignIn(DeviceKey device, SoftwareAuthenticator authenticator)
    {
        var options = await Json(await _client.PostAsync(new Uri("/v1/auth/passkeys/assert/options", UriKind.Relative), null, Ct));
        var assertion = authenticator.Get(options.GetProperty("options"));
        using var request = PasskeyRequest(device, options.GetProperty("challenge_id").GetGuid(), assertion);
        return await _client.SendAsync(request, Ct);
    }

    private async Task<JsonElement> SignIn(DeviceKey device, string idToken)
    {
        using var request = TokenRequest(device, idToken);
        var response = await _client.SendAsync(request, Ct);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await Json(response);
    }

    private async Task<HttpResponseMessage> Refresh(DeviceKey device, string refreshToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/refresh")
        {
            Content = JsonContent.Create(new Dictionary<string, string> { ["refresh_token"] = refreshToken }),
        };
        request.Headers.Add("DPoP", device.Proof("POST", Url("/v1/auth/refresh")));
        return await _client.SendAsync(request, Ct);
    }

    private async Task<string> RefreshOk(DeviceKey device, string refreshToken)
    {
        var response = await Refresh(device, refreshToken);
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (await Json(response)).GetProperty("refresh_token").GetString()!;
    }

    private async Task Logout(DeviceKey device, JsonElement tokens, bool everywhere)
    {
        var access = tokens.GetProperty("access_token").GetString()!;
        var response = await Call("/v1/auth/logout", access, device.Proof("POST", Url("/v1/auth/logout"), access),
            new JsonObject { ["everywhere"] = everywhere });
        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    private async Task<HttpResponseMessage> Call(string path, string accessToken, string? proof, JsonObject? body = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path);
        if (body is not null) request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        Authorize(request, accessToken, proof);
        return await _client.SendAsync(request, Ct);
    }

    private static void Authorize(HttpRequestMessage request, string accessToken, string? proof)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("DPoP", accessToken);
        if (proof is not null) request.Headers.Add("DPoP", proof);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement;

    private static async Task<string?> Error(HttpResponseMessage response)
    {
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        return (await Json(response)).GetProperty("error").GetString();
    }

    public void Dispose()
    {
        _client.Dispose();
        _phone.Dispose();
    }
}
