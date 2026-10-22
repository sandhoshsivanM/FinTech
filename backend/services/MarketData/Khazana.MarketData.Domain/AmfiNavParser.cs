using System.Globalization;

namespace Khazana.MarketData.Domain;

/// <summary>
/// Parses AMFI's daily NAVAll file into one quote per scheme.
/// </summary>
/// <remarks>
/// <para>
/// Columns are found from the <b>header row</b>, never assumed by position.
/// AMFI changed the file in 2026 from six columns to eight
/// (<c>Scheme Code;ISIN;ISIN;Scheme Name;Plan;Option;Net Asset Value;Date</c>),
/// which moved the NAV from the fifth field to the seventh; a fixed-position
/// parser then read "Direct Plan" as the NAV and silently dropped every row.
/// A file without a header falls back to the original six-column layout; a
/// header this parser doesn't recognise yields no rows, so the ingest fails
/// loudly instead of publishing misread prices.
/// </para>
/// <para>
/// Rules otherwise follow the Flutter app's <c>amfi_nav_provider.dart</c>:
/// AMC names and scheme-type headings are skipped, "N.A." and non-positive NAVs
/// are skipped (never recorded as zero), and the first real ISIN is kept. One
/// deliberate difference: a row without a date is skipped, because the server
/// keeps a dated price series.
/// </para>
/// <para>
/// The input is downloaded from the internet and treated as hostile: over-long
/// lines are skipped, numbers accept plain decimals only (no exponents or
/// thousands separators), and work is linear in the input.
/// </para>
/// </remarks>
public static class AmfiNavParser
{
    /// <summary>A real row is ~200 characters; anything this long is not one.</summary>
    public const int MaxLineLength = 2048;

    private static readonly string[] DateFormats = ["dd-MMM-yyyy", "d-MMM-yyyy"];

    /// <summary>Parses the whole file, keyed by AMFI scheme code. O(n) in the input.</summary>
    public static IReadOnlyDictionary<string, NavQuote> Parse(string body)
    {
        ArgumentNullException.ThrowIfNull(body);
        var result = new Dictionary<string, NavQuote>(StringComparer.Ordinal);
        Layout? layout = Layout.Legacy;

        foreach (var range in body.AsSpan().EnumerateLines())
        {
            if (range.Length > MaxLineLength) continue;
            var line = range.ToString().Trim().TrimStart('﻿');
            if (IsHeader(line))
            {
                layout = Layout.FromHeader(line);
                continue;
            }
            if (layout is not null && TryParseLine(line, layout, out var quote))
            {
                result[quote.SchemeCode] = quote;
            }
        }
        return result;
    }

    /// <summary>A header names its columns; "Scheme Code" may sit in any of them.</summary>
    private static bool IsHeader(string line) =>
        line.Contains("Scheme Code", StringComparison.OrdinalIgnoreCase) &&
        line.Split(';').Any(f => f.Trim().Equals("Scheme Code", StringComparison.OrdinalIgnoreCase));

    internal static bool TryParseLine(string line, Layout layout, out NavQuote quote)
    {
        quote = default!;
        if (line.Length == 0) return false;

        var parts = line.Split(';');
        // Data rows have every column; headings and AMC names do not.
        if (parts.Length < layout.FieldCount) return false;

        var schemeCode = parts[layout.Code].Trim();
        if (schemeCode.Length == 0 || !schemeCode.All(char.IsAsciiDigit)) return false;

        if (!decimal.TryParse(parts[layout.Nav].Trim(), NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var nav) || nav <= 0m)
        {
            return false;
        }

        if (!DateOnly.TryParseExact(parts[layout.Date].Trim(), DateFormats, CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date))
        {
            return false;
        }

        quote = new NavQuote(
            SchemeCode: schemeCode,
            SchemeName: ComposeName(parts, layout),
            Nav: nav,
            Isin: FirstNonEmpty(parts[layout.Isin1].Trim(), parts[layout.Isin2].Trim()),
            Date: date);
        return true;
    }

    /// <summary>
    /// The 2026 layout splits "Fund - Direct Plan - Growth" into three columns;
    /// they are joined back so one scheme code still reads as one product.
    /// </summary>
    private static string ComposeName(string[] parts, Layout layout)
    {
        var name = parts[layout.Name].Trim();
        foreach (var column in new[] { layout.Plan, layout.Option })
        {
            if (column is int i && parts[i].Trim() is { Length: > 0 } extra) name += " - " + extra;
        }
        return name;
    }

    private static string? FirstNonEmpty(params string[] values) =>
        values.FirstOrDefault(v => v.Length > 0 && v != "-");

    /// <summary>Where each field sits in a row.</summary>
    internal sealed record Layout(int Code, int Isin1, int Isin2, int Name, int? Plan, int? Option, int Nav, int Date)
    {
        /// <summary>The original six-column file, used when no header is seen.</summary>
        public static readonly Layout Legacy = new(0, 1, 2, 3, null, null, 4, 5);

        public int FieldCount { get; } = new[] { Code, Isin1, Isin2, Name, Plan ?? 0, Option ?? 0, Nav, Date }.Max() + 1;

        /// <summary>
        /// Maps a header row to column positions, or null when a required
        /// column is missing — better no rows than rows read from the wrong
        /// columns.
        /// </summary>
        public static Layout? FromHeader(string header)
        {
            var names = header.Split(';').Select(n => n.Trim()).ToList();
            int Find(Func<string, bool> match) => names.FindIndex(n => match(n));

            var isins = names.Select((n, i) => (n, i))
                .Where(x => x.n.Contains("ISIN", StringComparison.OrdinalIgnoreCase))
                .Select(x => x.i).ToList();
            var code = Find(n => n.Equals("Scheme Code", StringComparison.OrdinalIgnoreCase));
            var name = Find(n => n.Equals("Scheme Name", StringComparison.OrdinalIgnoreCase));
            var nav = Find(n => n.Equals("Net Asset Value", StringComparison.OrdinalIgnoreCase));
            var date = Find(n => n.Equals("Date", StringComparison.OrdinalIgnoreCase));
            var plan = Find(n => n.Equals("Plan", StringComparison.OrdinalIgnoreCase));
            var option = Find(n => n.Equals("Option", StringComparison.OrdinalIgnoreCase));

            if (code < 0 || name < 0 || nav < 0 || date < 0 || isins.Count < 2) return null;
            return new Layout(code, isins[0], isins[1], name,
                plan < 0 ? null : plan, option < 0 ? null : option, nav, date);
        }
    }
}
