using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace Khazana.Security.Dpop;

/// <summary>Remembers proofs already seen, so each is accepted once.</summary>
public interface IDpopReplayCache
{
    /// <summary>False when <paramref name="key"/> was already remembered and has not expired.</summary>
    Task<bool> TryRememberAsync(string key, DateTimeOffset until);
}

/// <summary>
/// In-process replay cache, for tests and single-instance tools. A service
/// running several instances must use <see cref="PostgresDpopReplayCache"/>,
/// or a proof could be replayed once per instance.
/// </summary>
public sealed class MemoryDpopReplayCache(IMemoryCache cache) : IDpopReplayCache
{
    private readonly Lock _gate = new();

    public Task<bool> TryRememberAsync(string key, DateTimeOffset until)
    {
        ArgumentNullException.ThrowIfNull(key);
        lock (_gate)
        {
            if (cache.TryGetValue(key, out _)) return Task.FromResult(false);
            cache.Set(key, true, new MemoryCacheEntryOptions { AbsoluteExpiration = until, Size = 1 });
            return Task.FromResult(true);
        }
    }
}

/// <summary>
/// Replay cache shared by every instance of a service, in the service's own
/// database: one primary-key insert per proof, so a proof seen by any instance
/// is refused by all. Expired keys are swept now and then by whichever request
/// happens to draw the short straw.
/// </summary>
public sealed class PostgresDpopReplayCache(NpgsqlDataSource dataSource) : IDpopReplayCache
{
    public const string CreateSql = """
        CREATE SCHEMA IF NOT EXISTS security;
        CREATE TABLE IF NOT EXISTS security.dpop_replay (
            key text PRIMARY KEY,
            expires_at timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_dpop_replay_expires ON security.dpop_replay (expires_at);
        """;

    public async Task<bool> TryRememberAsync(string key, DateTimeOffset until)
    {
        ArgumentNullException.ThrowIfNull(key);
        await using var conn = await dataSource.OpenConnectionAsync().ConfigureAwait(false);
        if (Random.Shared.Next(200) == 0)
        {
            await using var sweep = new NpgsqlCommand("DELETE FROM security.dpop_replay WHERE expires_at < now()", conn);
            await sweep.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
        // An expired leftover with the same key is replaced; a live one makes this a replay.
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO security.dpop_replay (key, expires_at) VALUES (@key, @until)
            ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at
                WHERE security.dpop_replay.expires_at < now()
            """, conn);
        cmd.Parameters.AddWithValue("key", key);
        cmd.Parameters.AddWithValue("until", until.ToUniversalTime());
        return await cmd.ExecuteNonQueryAsync().ConfigureAwait(false) == 1;
    }
}
