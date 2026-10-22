using Microsoft.Extensions.Caching.Memory;

namespace Khazana.Security.Dpop;

/// <summary>Remembers proofs already seen, so each is accepted once.</summary>
public interface IDpopReplayCache
{
    /// <summary>False when <paramref name="key"/> was already remembered and has not expired.</summary>
    bool TryRemember(string key, DateTimeOffset until);
}

/// <summary>
/// In-process replay cache. Correct for one instance of a service; with
/// several instances behind a load balancer a proof could be replayed once
/// per instance, so a shared store (Redis or Postgres) replaces this before
/// any service scales out.
/// </summary>
public sealed class MemoryDpopReplayCache(IMemoryCache cache) : IDpopReplayCache
{
    private readonly Lock _gate = new();

    public bool TryRemember(string key, DateTimeOffset until)
    {
        ArgumentNullException.ThrowIfNull(key);
        lock (_gate)
        {
            if (cache.TryGetValue(key, out _)) return false;
            cache.Set(key, true, new MemoryCacheEntryOptions { AbsoluteExpiration = until, Size = 1 });
            return true;
        }
    }
}
