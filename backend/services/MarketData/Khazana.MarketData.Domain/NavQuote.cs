namespace Khazana.MarketData.Domain;

/// <summary>One mutual fund scheme's net asset value on a date.</summary>
/// <param name="Nav">Always positive. Money is <c>decimal</c>, never <c>double</c>.</param>
public sealed record NavQuote(string SchemeCode, string SchemeName, decimal Nav, string? Isin, DateOnly Date);
