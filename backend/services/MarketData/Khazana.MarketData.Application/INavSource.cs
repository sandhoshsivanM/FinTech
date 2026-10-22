namespace Khazana.MarketData.Application;

/// <summary>
/// Where the day's NAV file comes from. A port: the real AMFI download and the
/// fixture used in development and tests are both adapters in Infrastructure,
/// chosen by configuration (decision D15, free first).
/// </summary>
public interface INavSource
{
    /// <summary>The raw NAVAll text. Implementations must cap its size.</summary>
    Task<string> FetchAllAsync(CancellationToken cancellationToken);
}
