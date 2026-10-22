using System.Globalization;

namespace Khazana.Admin;

/// <summary>Times shown in IST, the team's time zone; stored and sent as UTC.</summary>
public static class Ist
{
    private static readonly TimeSpan Offset = TimeSpan.FromHours(5.5);

    public static string Format(DateTimeOffset t) => t.ToOffset(Offset).ToString("dd MMM yyyy, HH:mm", CultureInfo.InvariantCulture);
}
