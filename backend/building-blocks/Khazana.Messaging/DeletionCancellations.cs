using Khazana.Messaging.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Wolverine;

namespace Khazana.Messaging;

/// <summary>
/// Remembers account deletions the user cancelled during the cooling-off, so a
/// purge already scheduled for that deletion does nothing when it fires. Kept
/// in each service's own database; every service that holds user data opts in.
/// </summary>
/// <remarks>
/// Keyed by user and <c>ExecuteAfter</c>, the deletion it cancels: a later,
/// new deletion request has a different time and is not affected.
/// </remarks>
public sealed class DeletionCancellations(NpgsqlDataSource dataSource)
{
    internal const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS account;
        CREATE TABLE IF NOT EXISTS account.deletion_cancellations (
            user_id uuid NOT NULL,
            execute_after timestamptz NOT NULL,
            PRIMARY KEY (user_id, execute_after)
        );
        """;

    public async Task RecordAsync(Guid userId, DateTimeOffset executeAfter, CancellationToken ct)
    {
        await using var cmd = dataSource.CreateCommand(
            "INSERT INTO account.deletion_cancellations (user_id, execute_after) VALUES ($1, $2) ON CONFLICT DO NOTHING");
        cmd.Parameters.AddWithValue(userId);
        cmd.Parameters.AddWithValue(executeAfter.ToUniversalTime());
        await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
    }

    public async Task<bool> IsCancelledAsync(Guid userId, DateTimeOffset executeAfter, CancellationToken ct)
    {
        await using var cmd = dataSource.CreateCommand(
            "SELECT EXISTS (SELECT 1 FROM account.deletion_cancellations WHERE user_id = $1 AND execute_after = $2)");
        cmd.Parameters.AddWithValue(userId);
        cmd.Parameters.AddWithValue(executeAfter.ToUniversalTime());
        return (bool)(await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false))!;
    }
}

/// <summary>Records <see cref="AccountDeletionCancelledV1"/> for the service it runs in.</summary>
public static class AccountDeletionCancelledHandler
{
    public static Task Handle(AccountDeletionCancelledV1 message, DeletionCancellations cancellations, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(cancellations);
        return cancellations.RecordAsync(message.UserId, message.ExecuteAfter, ct);
    }
}

public static class DeletionCancellationsSetup
{
    /// <summary>For services that hold user data: registers the store and its table.</summary>
    public static IServiceCollection AddDeletionCancellations(this IServiceCollection services, string connectionString)
    {
        services.AddKeyedSingleton(nameof(DeletionCancellations), (_, _) => NpgsqlDataSource.Create(connectionString));
        services.AddSingleton(sp => new DeletionCancellations(sp.GetRequiredKeyedService<NpgsqlDataSource>(nameof(DeletionCancellations))));
        services.AddHostedService<CancellationSchema>();
        return services;
    }

    /// <summary>Listens for <see cref="AccountDeletionCancelledV1"/> (pair with <see cref="AddDeletionCancellations"/>).</summary>
    public static WolverineOptions ListenForDeletionCancellations(this WolverineOptions opts)
    {
        ArgumentNullException.ThrowIfNull(opts);
        opts.Discovery.IncludeType(typeof(AccountDeletionCancelledHandler));
        return opts;
    }

    private sealed class CancellationSchema([FromKeyedServices(nameof(DeletionCancellations))] NpgsqlDataSource dataSource) : IHostedService
    {
        public async Task StartAsync(CancellationToken cancellationToken)
        {
            await using var cmd = dataSource.CreateCommand(DeletionCancellations.CreateSql);
            await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
