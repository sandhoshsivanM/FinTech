using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Khazana.Credit.Application;
using Khazana.Credit.Domain;

namespace Khazana.Credit.Infrastructure;

/// <summary>
/// Sample credit bureau (decision D15, free first): a realistic report that
/// is the same for the same PAN every time, with no network. Marked
/// <see cref="CreditReport.Sample"/> and refused in Production.
/// </summary>
/// <remarks>
/// The PAN is hashed into a seed in memory and dropped; it is never kept.
/// PANs whose last letter is <c>Z</c> answer "no record at the bureau", so
/// the app's empty state can be tried.
/// </remarks>
public sealed class FakeCreditReportProvider : ICreditReportProvider
{
    public const string ProviderName = "fake";

    private static readonly string[] Factors =
    [
        "Low credit card utilisation",
        "No missed payments in the last 12 months",
        "Long credit history",
        "Recent credit enquiries",
        "High credit card utilisation",
        "A payment 30 days late in the last year",
    ];

    public string Name => ProviderName;

    public Task<CreditReport> FetchReportAsync(CreditReportRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.Pan.EndsWith('Z')) throw new CreditProviderException("no_record", "The sample bureau has no record for this PAN.");

        var seed = BitConverter.ToInt32(SHA256.HashData(Encoding.UTF8.GetBytes($"khazana-fake-credit|{request.Pan}")), 0);
        var rng = new Random(seed);
        var today = DateOnly.FromDateTime(request.RequestedAt.UtcDateTime);
        var late = rng.Next(0, 5) == 0;

        var accounts = new List<CreditAccount>
        {
            Card(rng, "HDFC Bank", 300_000, today, late),
            Card(rng, "State Bank of India", 150_000, today, false),
        };
        if (rng.Next(0, 2) == 0) accounts.Add(Card(rng, "ICICI Bank", 200_000, today, false));
        accounts.Add(rng.Next(0, 3) switch
        {
            0 => Loan(rng, "HDFC Bank", "HOME_LOAN", 4_500_000, 240, 8.50m, today),
            1 => Loan(rng, "Axis Bank", "AUTO_LOAN", 800_000, 60, 9.25m, today),
            _ => Loan(rng, "Bajaj Finance", "PERSONAL_LOAN", 300_000, 36, 13.50m, today),
        });
        accounts.Add(Closed(rng, today));

        var enquiries = Enumerable.Range(0, rng.Next(0, 4))
            .Select(_ => new CreditEnquiry(
                rng.Next(0, 2) == 0 ? "Axis Bank" : "Kotak Mahindra Bank",
                rng.Next(0, 2) == 0 ? "CREDIT_CARD" : "PERSONAL_LOAN",
                today.AddDays(-rng.Next(5, 170)),
                rng.Next(0, 2) == 0 ? Money(100_000m * rng.Next(1, 6)) : null))
            .OrderByDescending(e => e.On).ToList();

        var cards = accounts.Where(a => a.AccountType == "CREDIT_CARD" && a.Status == "ACTIVE").ToList();
        var limit = cards.Sum(c => decimal.Parse(c.CreditLimit!, CultureInfo.InvariantCulture));
        var used = cards.Sum(c => decimal.Parse(c.CurrentBalance, CultureInfo.InvariantCulture));
        var utilisation = limit == 0 ? 0 : Math.Round(used / limit * 100, 1);
        var overdue = accounts.Sum(a => decimal.Parse(a.AmountOverdue, CultureInfo.InvariantCulture));

        var score = Math.Clamp(820 - (int)(utilisation * 2) - (late ? 60 : 0) - (enquiries.Count * 8) + rng.Next(-15, 16), 300, 900);
        var factors = new List<string>();
        factors.Add(utilisation < 30 ? Factors[0] : Factors[4]);
        factors.Add(late ? Factors[5] : Factors[1]);
        factors.Add(Factors[2]);
        if (enquiries.Count > 1) factors.Add(Factors[3]);

        var active = accounts.Count(a => a.Status == "ACTIVE");
        var report = new CreditReport(
            CreditReport.Kind,
            "CIBIL",
            $"SAMPLE-{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{request.PullId:N}")))[..12]}",
            request.RequestedAt,
            Sample: true,
            new CreditScore(score, 300, 900, "Sample score (CIBIL-style, 300–900)", factors),
            new CreditSummary(
                accounts.Count, active, accounts.Count(a => a.AmountOverdue != "0.00"),
                Money(accounts.Where(a => a.Status == "ACTIVE").Sum(a => decimal.Parse(a.CurrentBalance, CultureInfo.InvariantCulture))),
                Money(overdue),
                utilisation.ToString("0.0", CultureInfo.InvariantCulture),
                enquiries.Count(e => e.On >= today.AddMonths(-6))),
            accounts,
            enquiries);
        return Task.FromResult(report);
    }

    private static CreditAccount Card(Random rng, string lender, int maxLimit, DateOnly today, bool late)
    {
        var limit = 50_000m * rng.Next(1, (maxLimit / 50_000) + 1);
        var balance = Math.Round(limit * (rng.Next(3, 45) / 100m), 2);
        var history = Enumerable.Range(0, 12).Select(i => late && i == rng.Next(2, 9) ? 30 : 0).ToList();
        return new CreditAccount(lender, "CREDIT_CARD", Masked(rng), "INDIVIDUAL", "ACTIVE",
            today.AddMonths(-rng.Next(14, 96)), null, Money(limit), null, Money(balance), "0.00", null,
            today.AddDays(-rng.Next(3, 25)), history);
    }

    private static CreditAccount Loan(Random rng, string lender, string type, int principal, int months, decimal rate, DateOnly today)
    {
        var elapsed = rng.Next(6, Math.Min(months, 72));
        var r = rate / 1200m;
        var emi = Math.Round(principal * r * Pow(1 + r, months) / (Pow(1 + r, months) - 1), 0);
        var remaining = Math.Max(0m, Math.Round(principal * (1 - ((decimal)elapsed / months * 0.85m)), 0));
        return new CreditAccount(lender, type, Masked(rng), "INDIVIDUAL", "ACTIVE",
            today.AddMonths(-elapsed), null, null, Money(principal), Money(remaining), "0.00", Money(emi),
            today.AddDays(-rng.Next(3, 25)), [.. Enumerable.Repeat(0, 12)]);
    }

    private static CreditAccount Closed(Random rng, DateOnly today)
    {
        var opened = today.AddMonths(-rng.Next(48, 110));
        return new CreditAccount("Bajaj Finance", "CONSUMER_LOAN", Masked(rng), "INDIVIDUAL", "CLOSED",
            opened, opened.AddMonths(12), null, Money(45_000m), "0.00", "0.00", null, opened.AddMonths(12), [.. Enumerable.Repeat(0, 12)]);
    }

    private static decimal Pow(decimal x, int n)
    {
        var result = 1m;
        for (var i = 0; i < n; i++) result *= x;
        return result;
    }

    private static string Masked(Random rng) => $"XXXXXXXXXXXX{rng.Next(1000, 9999).ToString(CultureInfo.InvariantCulture)}";

    private static string Money(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);
}
