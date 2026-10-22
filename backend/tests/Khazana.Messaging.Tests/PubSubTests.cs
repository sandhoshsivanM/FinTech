using System.Collections.Concurrent;
using Khazana.Messaging;
using Khazana.Messaging.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Shouldly;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using Wolverine.Tracking;

namespace Khazana.Messaging.Tests;

/// <summary>Which service handled which event.</summary>
public sealed class Received
{
    public ConcurrentBag<(string Service, Guid UserId)> Events { get; } = [];
}

public sealed class Inbox(string service, Received received)
{
    public void Record(Guid userId) => received.Events.Add((service, userId));
}

// One handler class per pretend service; each host discovers only its own.
public static class ServiceAHandler
{
    public static void Handle(UserSignedInV1 m, Inbox inbox) => inbox.Record(m.UserId);
}

public static class ServiceBHandler
{
    public static void Handle(UserSignedInV1 m, Inbox inbox) => inbox.Record(m.UserId);
}

/// <summary>
/// The broker setup itself, across services: real RabbitMQ, separate hosts,
/// separate databases, as in production. Per-service tests can't catch a
/// routing mistake, because each runs one service alone.
/// </summary>
public sealed class PubSubTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine").Build();
    private readonly RabbitMqContainer _rabbitMq = new RabbitMqBuilder("rabbitmq:4-management-alpine").Build();
    private readonly Received _received = new();
    private readonly List<IHost> _hosts = [];

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync(), _rabbitMq.StartAsync());
        await using var conn = new NpgsqlConnection(_postgres.GetConnectionString());
        await conn.OpenAsync();
        foreach (var db in new[] { "svc_a", "svc_b", "svc_pub" })
        {
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE {db}", conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    private async Task<IHost> StartService(string name, Type? handler)
    {
        var database = new NpgsqlConnectionStringBuilder(_postgres.GetConnectionString()) { Database = $"svc_{name}" }.ConnectionString;
        var host = await Host.CreateDefaultBuilder()
            .ConfigureServices(s => s.AddSingleton(_received).AddSingleton(sp => new Inbox(name, sp.GetRequiredService<Received>())))
            .UseWolverine(opts =>
            {
                opts.UseKhazanaMessaging(name, _rabbitMq.GetConnectionString(), database);
                opts.Discovery.DisableConventionalDiscovery();
                if (handler is not null) opts.Discovery.IncludeType(handler);
            })
            .StartAsync();
        _hosts.Add(host);
        return host;
    }

    [Fact]
    public async Task Every_service_that_handles_an_event_receives_it_not_just_one()
    {
        await StartService("a", typeof(ServiceAHandler));
        await StartService("b", typeof(ServiceBHandler));
        var publisher = await StartService("pub", null);

        var user = Guid.NewGuid();
        await publisher.TrackActivity().IncludeExternalTransports().AlsoTrack([.. _hosts])
            .Timeout(TimeSpan.FromSeconds(60))
            .WaitForMessageToBeReceivedAt<UserSignedInV1>(_hosts[1])
            .PublishMessageAndWaitAsync(new UserSignedInV1(user, Guid.NewGuid(), "ios", DateTimeOffset.UtcNow));

        // Give the other subscriber a moment too, then check both got exactly one copy.
        for (var i = 0; i < 50 && _received.Events.Count(e => e.UserId == user) < 2; i++)
            await Task.Delay(100, TestContext.Current.CancellationToken);
        _received.Events.Where(e => e.UserId == user).Select(e => e.Service).Order().ShouldBe(["a", "b"]);
    }

    [Fact]
    public void Only_transient_database_conflicts_are_retried()
    {
        static PostgresException Pg(string state) => new("conflict", "ERROR", "ERROR", state);
        KhazanaMessaging.IsTransientDatabaseConflict(new InvalidOperationException("wrapped", Pg(PostgresErrorCodes.UniqueViolation))).ShouldBeTrue();
        KhazanaMessaging.IsTransientDatabaseConflict(Pg(PostgresErrorCodes.DeadlockDetected)).ShouldBeTrue();
        KhazanaMessaging.IsTransientDatabaseConflict(Pg(PostgresErrorCodes.SerializationFailure)).ShouldBeTrue();
        KhazanaMessaging.IsTransientDatabaseConflict(Pg(PostgresErrorCodes.UndefinedTable)).ShouldBeFalse();
        KhazanaMessaging.IsTransientDatabaseConflict(new InvalidOperationException("bug")).ShouldBeFalse();
    }

    [Fact]
    public void Each_service_gets_its_own_queue_name() =>
        KhazanaMessaging.QueueName("sync", typeof(UserRegisteredV1))
            .ShouldNotBe(KhazanaMessaging.QueueName("identity", typeof(UserRegisteredV1)));

    public async ValueTask DisposeAsync()
    {
        foreach (var host in _hosts)
        {
            await host.StopAsync();
            host.Dispose();
        }
        await Task.WhenAll(_postgres.DisposeAsync().AsTask(), _rabbitMq.DisposeAsync().AsTask());
    }
}
