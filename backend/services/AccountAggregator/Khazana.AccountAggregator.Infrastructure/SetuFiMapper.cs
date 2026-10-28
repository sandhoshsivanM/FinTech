using System.Globalization;
using System.Text.Json;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;

namespace Khazana.AccountAggregator.Infrastructure;

/// <summary>
/// Setu's decrypted FI data (ReBIT FI schemas, JSON format) to a
/// <see cref="FiBundle"/>. Tolerant where the schemas are: a single item may
/// arrive as an object instead of a one-item array, money as a number or a
/// string, and field names in camelCase or ReBIT's mixed case. An account
/// this can't read is skipped rather than failing the whole fetch; data that
/// isn't the shape at all fails it as non-transient.
/// </summary>
internal static class SetuFiMapper
{
    public static FiBundle Map(JsonElement session, FiFetchContext context)
    {
        if (!session.TryGetProperty("fips", out var fips) || fips.ValueKind != JsonValueKind.Array)
            throw new BankDataProviderException("provider_unreadable", transient: false, "Setu session has no FIP list.");

        var deposits = new List<DepositAccount>();
        var terms = new List<TermDepositAccount>();
        var funds = new List<MutualFundFolio>();
        var demat = new List<DematAccount>();
        var nps = new List<NpsAccount>();
        var insurance = new List<InsurancePolicy>();

        foreach (var fip in fips.EnumerateArray())
        {
            var fipId = S(fip, "fipID") ?? S(fip, "fipId") ?? "unknown";
            foreach (var account in Items(fip, "accounts"))
            {
                var status = S(account, "FIstatus") ?? S(account, "FIStatus") ?? S(account, "fiStatus");
                if (status is not null && !status.Equals("READY", StringComparison.OrdinalIgnoreCase) &&
                    !status.Equals("DELIVERED", StringComparison.OrdinalIgnoreCase)) continue;
                var linkRef = S(account, "linkRefNumber") ?? S(account, "linkRef");
                var masked = S(account, "maskedAccNumber") ?? "XXXX";
                if (linkRef is null) continue;
                if (!account.TryGetProperty("data", out var data) || !data.TryGetProperty("account", out var acc)) continue;
                var summary = Obj(acc, "summary");
                var type = (S(acc, "type") ?? string.Empty).ToUpperInvariant();
                try
                {
                    switch (type)
                    {
                        case "DEPOSIT":
                            deposits.Add(Deposit(acc, summary, linkRef, fipId, masked, context));
                            break;
                        case "TERM_DEPOSIT" or "TERM-DEPOSIT" or "RECURRING_DEPOSIT" or "RECURRING-DEPOSIT":
                            terms.Add(Term(summary, linkRef, fipId, masked, type.StartsWith("RECURRING", StringComparison.Ordinal)));
                            break;
                        case "MUTUAL_FUNDS" or "MUTUALFUNDS":
                            funds.Add(new MutualFundFolio(linkRef, fipId, fipId, masked, FundHoldings(summary)));
                            break;
                        case "EQUITIES" or "ETF":
                            demat.Add(new DematAccount(linkRef, fipId, fipId, masked, EquityHoldings(summary, type == "ETF" ? "ETF" : "EQUITY")));
                            break;
                        case "NPS":
                            nps.Add(new NpsAccount(linkRef, fipId, fipId, masked, S(summary, "tier") ?? "TIER_I",
                                Money(summary, "currentValue", "totalValue", "closingBalance"),
                                Day(summary, "asOnDate", "valuationDate") ?? DateOnly.FromDateTime(context.Now.UtcDateTime)));
                            break;
                        case "INSURANCE_POLICIES" or "INSURANCE":
                            insurance.Add(Policy(summary, linkRef, fipId, masked));
                            break;
                    }
                }
                catch (FormatException)
                {
                    // One unreadable account: skipped, the rest still arrive.
                }
            }
        }

        return new FiBundle(FiBundle.Kind, context.ConsentId, context.Now, context.From, context.To,
            deposits, terms, funds, demat, nps, [], insurance);
    }

    private static DepositAccount Deposit(JsonElement acc, JsonElement summary, string linkRef, string fipId, string masked, FiFetchContext context)
    {
        var txns = new List<DepositTransaction>();
        foreach (var t in Items(Obj(acc, "transactions"), "transaction"))
        {
            var id = S(t, "txnId");
            var at = Time(t, "transactionTimestamp");
            if (id is null || at is null) continue;
            var type = (S(t, "type") ?? string.Empty).ToUpperInvariant();
            if (type is not ("CREDIT" or "DEBIT")) continue;
            txns.Add(new DepositTransaction(
                id, type, (S(t, "mode") ?? "OTHERS").ToUpperInvariant(), Money(t, "amount"),
                MoneyOr(t, "0", "currentBalance", "balance"), at.Value,
                Day(t, "valueDate") ?? DateOnly.FromDateTime(at.Value.UtcDateTime),
                Trim(S(t, "narration") ?? string.Empty, 256), Trim(S(t, "reference") ?? string.Empty, 64)));
        }
        return new DepositAccount(linkRef, fipId, fipId, masked, (S(summary, "type") ?? "SAVINGS").ToUpperInvariant(),
            S(summary, "ifscCode") ?? S(summary, "ifsc"), S(summary, "currency") ?? "INR",
            Money(summary, "currentBalance"), Time(summary, "balanceDateTime") ?? context.Now, txns);
    }

    private static TermDepositAccount Term(JsonElement s, string linkRef, string fipId, string masked, bool recurring) => new(
        linkRef, fipId, fipId, masked, recurring ? "RECURRING" : "TERM",
        Money(s, "principalAmount", "principal"), MoneyOr(s, "0", "interestRate"),
        Day(s, "openingDate") ?? DateOnly.MinValue, Day(s, "maturityDate") ?? DateOnly.MinValue,
        MoneyOr(s, "0", "maturityAmount"), Money(s, "currentValue", "currentBalance", "principalAmount"),
        recurring ? MoneyOr(s, "0", "recurringAmount", "installmentAmount") : null);

    private static List<MutualFundHolding> FundHoldings(JsonElement summary)
    {
        var rows = Items(Obj(Obj(summary, "investment"), "holdings"), "holding");
        var parsed = rows.Select(h =>
        {
            var units = Dec(h, "closingUnits", "units") ?? 0m;
            var nav = Dec(h, "nav") ?? 0m;
            return (h, units, nav, value: decimal.Round(units * nav, 2));
        }).Where(x => x.units > 0).ToList();
        // ReBIT gives cost per folio, not per scheme: spread it by current value.
        var totalValue = parsed.Sum(x => x.value);
        var totalCost = Dec(summary, "costValue");
        return [.. parsed.Select(x => new MutualFundHolding(
            S(x.h, "isin") ?? string.Empty,
            S(x.h, "amfiCode") ?? S(x.h, "schemeCode") ?? string.Empty,
            S(x.h, "isinDescription") ?? S(x.h, "schemeName") ?? S(x.h, "schemeCode") ?? "Mutual fund",
            Inv(x.units), Inv(x.nav),
            Day(x.h, "navDate") ?? DateOnly.MinValue,
            Inv(totalCost is { } c && totalValue > 0 ? decimal.Round(c * x.value / totalValue, 2) : x.value),
            Inv(x.value)))];
    }

    private static List<EquityHolding> EquityHoldings(JsonElement summary, string kind)
    {
        var list = new List<EquityHolding>();
        foreach (var h in Items(Obj(Obj(summary, "investment"), "holdings"), "holding"))
        {
            var units = Dec(h, "units", "closingUnits") ?? 0m;
            if (units <= 0) continue;
            var price = Dec(h, "lastTradedPrice", "nav", "rate") ?? 0m;
            var isin = S(h, "isin") ?? string.Empty;
            list.Add(new EquityHolding(isin, S(h, "symbol") ?? isin, S(h, "issuerName") ?? S(h, "isinDescription") ?? isin,
                S(h, "exchange") ?? "NSE", kind, Inv(units), Inv(price), Inv(decimal.Round(units * price, 2))));
        }
        return list;
    }

    private static InsurancePolicy Policy(JsonElement s, string linkRef, string fipId, string masked) => new(
        linkRef, fipId, fipId, masked, (S(s, "policyType") ?? "TERM").ToUpperInvariant(),
        S(s, "policyName") ?? "Insurance policy", Money(s, "sumAssured", "coverAmount"),
        MoneyOr(s, "0", "premiumAmount", "premium"), (S(s, "premiumFrequency") ?? "YEARLY").ToUpperInvariant(),
        Day(s, "policyStartDate", "startDate") ?? DateOnly.MinValue, Day(s, "nextPremiumDueDate"), Day(s, "maturityDate"));

    // --- tolerant JSON reading --------------------------------------------

    private static JsonElement Obj(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && TryGet(e, name, out var v) && v.ValueKind == JsonValueKind.Object ? v : default;

    /// <summary>An array, a single object as one item, or nothing.</summary>
    private static List<JsonElement> Items(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !TryGet(e, name, out var v)) return [];
        return v.ValueKind switch
        {
            JsonValueKind.Array => [.. v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object)],
            JsonValueKind.Object => [v],
            _ => [],
        };
    }

    private static bool TryGet(JsonElement e, string name, out JsonElement value)
    {
        if (e.TryGetProperty(name, out value)) return true;
        foreach (var p in e.EnumerateObject())
        {
            if (p.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
            {
                value = p.Value;
                return true;
            }
        }
        return false;
    }

    private static string? S(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !TryGet(e, name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            _ => null,
        };
    }

    private static decimal? Dec(JsonElement e, params string[] names)
    {
        foreach (var n in names)
        {
            if (S(e, n) is { } raw && decimal.TryParse(raw, NumberStyles.Number | NumberStyles.AllowExponent, CultureInfo.InvariantCulture, out var d))
                return d;
        }
        return null;
    }

    private static string Inv(decimal d) => d.ToString(CultureInfo.InvariantCulture);

    /// <summary>A required money field: missing or malformed skips the account.</summary>
    private static string Money(JsonElement e, params string[] names) => Dec(e, names) is { } d ? Inv(d) : throw new FormatException("money");

    private static string MoneyOr(JsonElement e, string fallback, params string[] names) => Dec(e, names) is { } d ? Inv(d) : fallback;

    private static DateOnly? Day(JsonElement e, params string[] names)
    {
        foreach (var n in names)
        {
            var raw = S(e, n);
            if (raw is null) continue;
            if (DateOnly.TryParseExact(raw.Length >= 10 ? raw[..10] : raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d;
            if (DateOnly.TryParseExact(raw, "dd-MM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out d)) return d;
        }
        return null;
    }

    private static DateTimeOffset? Time(JsonElement e, string name) =>
        S(e, name) is { } raw && DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var t) ? t : null;

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max];
}
