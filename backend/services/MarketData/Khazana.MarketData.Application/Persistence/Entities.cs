namespace Khazana.MarketData.Application.Persistence;

/// <summary>One scheme's NAV on one date. Written by bulk upsert, read rarely.</summary>
public sealed class NavQuoteRow
{
    public required string SchemeCode { get; init; }
    public required DateOnly NavDate { get; init; }
    public required decimal Nav { get; set; }
    public string? Isin { get; set; }
    public required string SchemeName { get; set; }
}

/// <summary>The published whole-day file, served as-is to every device.</summary>
public sealed class NavFileRow
{
    public required DateOnly NavDate { get; init; }
    public required int RowCount { get; set; }
    public required string Sha256 { get; set; }
    public required byte[] Gzip { get; set; }
    public required DateTimeOffset CreatedAt { get; set; }
}
