namespace Khazana.SharedKernel;

/// <summary>
/// The current time, behind an interface so tests can pin it. Code that calls
/// <see cref="DateTimeOffset.UtcNow"/> directly cannot be tested at midnight,
/// at month end, or in another time zone.
/// </summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

/// <summary>
/// India Standard Time without depending on the host's time-zone database:
/// IST is a fixed UTC+05:30 with no daylight saving, and a container image
/// without tzdata would otherwise throw on lookup.
/// </summary>
public static class IndiaTime
{
    public static readonly TimeSpan Offset = TimeSpan.FromHours(5.5);

    public static DateTimeOffset ToIst(DateTimeOffset instant) => instant.ToOffset(Offset);
}
