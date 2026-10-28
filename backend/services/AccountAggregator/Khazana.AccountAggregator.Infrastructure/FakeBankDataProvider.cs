using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Khazana.AccountAggregator.Application;
using Khazana.AccountAggregator.Domain;
using Khazana.SharedKernel;

namespace Khazana.AccountAggregator.Infrastructure;

/// <summary>Settings for the sample adapter (<c>Providers:FakeAa</c>).</summary>
public sealed class FakeAaOptions
{
    public const string Section = "Providers:FakeAa";

    /// <summary>
    /// True: a consent counts as approved the first time its status is
    /// checked, standing in for the user tapping "Approve" at their AA. False:
    /// it stays pending until a signed callback says otherwise.
    /// </summary>
    public bool AutoApprove { get; set; } = true;

    /// <summary>HMAC key for sample callbacks. Development has a built-in one; anywhere else it must be set.</summary>
    public string? CallbackSecret { get; set; }
}

/// <summary>
/// Sample Account Aggregator (decision D15, free first): realistic,
/// deterministic data with no network and no partner. The same user always
/// sees the same banks, folios and policies; transactions follow from the
/// date window. Refused in Production by the startup guard.
/// </summary>
/// <remarks>
/// Callbacks are signed like a real partner's would be, but with HMAC-SHA256:
/// <c>X-Aa-Timestamp</c> (Unix seconds) and <c>X-Aa-Signature</c> (hex of
/// HMAC(secret, timestamp + "." + body)), accepted within five minutes.
/// </remarks>
public sealed class FakeBankDataProvider(FakeAaOptions options) : IBankDataProvider
{
    public const string ProviderName = "fake";
    public const string DevelopmentCallbackSecret = "khazana-development-only-aa-callback-secret";
    public const string TimestampHeader = "X-Aa-Timestamp";
    public const string SignatureHeader = "X-Aa-Signature";
    private static readonly TimeSpan CallbackWindow = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, ConsentStatus> _statuses = new(StringComparer.Ordinal);
    private readonly byte[] _secret = Encoding.UTF8.GetBytes(options.CallbackSecret ?? DevelopmentCallbackSecret);

    public string Name => ProviderName;

    public bool IsSample => true;

    public Task<ConsentCreated> CreateConsentAsync(ConsentRequest request, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);
        // The handle carries a stable per-user seed, so the sample data survives restarts.
        var seed = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"khazana-fake-aa|{request.UserId:D}")))[..16].ToLowerInvariant();
        var handle = $"fake-{seed}-{request.ConsentId:N}";
        _statuses[handle] = ConsentStatus.Pending;
        return Task.FromResult(new ConsentCreated(handle, new Uri($"https://fake-aa.khazana.invalid/consents/{handle}")));
    }

    public Task<ConsentStatus> GetConsentStatusAsync(string consentHandle, CancellationToken ct)
    {
        var status = _statuses.GetOrAdd(consentHandle, ConsentStatus.Pending);
        if (status == ConsentStatus.Pending && options.AutoApprove)
            status = _statuses[consentHandle] = ConsentStatus.Active;
        return Task.FromResult(status);
    }

    public Task RevokeConsentAsync(string consentHandle, CancellationToken ct)
    {
        _statuses[consentHandle] = ConsentStatus.Revoked;
        return Task.CompletedTask;
    }

    /// <summary>Sample data is always ready at once: no callback to wait for.</summary>
    public Task<FiRequestStarted> RequestFiDataAsync(string consentHandle, DateOnly dataFrom, DateOnly dataTo, CancellationToken ct)
    {
        if (_statuses.TryGetValue(consentHandle, out var status) && status is ConsentStatus.Revoked or ConsentStatus.Expired or ConsentStatus.Rejected)
            throw new BankDataProviderException("consent_inactive", transient: false, "The sample AA says this consent has ended.");
        var session = $"fake-session-{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{consentHandle}|{dataFrom:O}|{dataTo:O}")))[..24].ToLowerInvariant()}";
        return Task.FromResult(new FiRequestStarted(session, DataReady: true));
    }

    public Task<FiFetchResult> FetchFiDataAsync(FiFetchContext context, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(context);
        var bundle = SampleBank.Build(context, SeedOf(context.ConsentHandle));
        return Task.FromResult(new FiFetchResult(bundle, bundle.AccountCount));
    }

    public AaCallback? VerifyCallback(byte[] body, Func<string, string?> header, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(body);
        ArgumentNullException.ThrowIfNull(header);
        if (!long.TryParse(header(TimestampHeader), NumberStyles.None, CultureInfo.InvariantCulture, out var unix)) return null;
        DateTimeOffset at;
        try
        {
            at = DateTimeOffset.FromUnixTimeSeconds(unix);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
        if ((now - at).Duration() > CallbackWindow) return null;

        var presented = header(SignatureHeader);
        if (presented is null || presented.Length != 64) return null;
        byte[] presentedBytes;
        try
        {
            presentedBytes = Convert.FromHexString(presented);
        }
        catch (FormatException)
        {
            return null;
        }
        if (!CryptographicOperations.FixedTimeEquals(Sign(_secret, unix, body), presentedBytes)) return null;

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var handle = root.GetProperty("consent_handle").GetString();
            if (string.IsNullOrEmpty(handle)) return null;
            switch (root.GetProperty("type").GetString())
            {
                case "consent_status":
                    if (!TryStatus(root.GetProperty("status").GetString(), out var status)) return null;
                    _statuses[handle] = status;
                    return new AaCallback(AaCallbackKind.ConsentStatus, handle, status, null);
                case "data_ready":
                    var session = root.GetProperty("session_id").GetString();
                    return string.IsNullOrEmpty(session) ? null : new AaCallback(AaCallbackKind.DataReady, handle, null, session);
                default:
                    return null;
            }
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>How a sample callback is signed; for tests and for trying callbacks by hand in development.</summary>
    public static string SignCallback(string secret, long unixSeconds, byte[] body) =>
        Convert.ToHexString(Sign(Encoding.UTF8.GetBytes(secret), unixSeconds, body)).ToLowerInvariant();

    private static byte[] Sign(byte[] secret, long unixSeconds, byte[] body)
    {
        var prefix = Encoding.ASCII.GetBytes(unixSeconds.ToString(CultureInfo.InvariantCulture) + ".");
        byte[] message = [.. prefix, .. body];
        return HMACSHA256.HashData(secret, message);
    }

    /// <summary>The ReBIT consent statuses a partner reports.</summary>
    private static bool TryStatus(string? wire, out ConsentStatus status)
    {
        status = wire switch
        {
            "ACTIVE" => ConsentStatus.Active,
            "PAUSED" => ConsentStatus.Paused,
            "REVOKED" => ConsentStatus.Revoked,
            "EXPIRED" => ConsentStatus.Expired,
            "REJECTED" => ConsentStatus.Rejected,
            "PENDING" => ConsentStatus.Pending,
            _ => (ConsentStatus)(-1),
        };
        return Enum.IsDefined(status);
    }

    /// <summary>The per-user part of the handle; any other handle seeds from itself.</summary>
    private static int SeedOf(string handle)
    {
        var parts = handle.Split('-');
        var key = parts.Length >= 3 && parts[0] == "fake" ? parts[1] : handle;
        return BitConverter.ToInt32(SHA256.HashData(Encoding.UTF8.GetBytes(key)), 0);
    }

    /// <summary>Builds the sample data. Pure: the same seed and window give the same bundle.</summary>
    private static class SampleBank
    {
        private sealed record Bank(string FipId, string Name, string Ifsc);

        private static readonly Bank[] Banks =
        [
            new("HDFC-FIP", "HDFC Bank", "HDFC0001234"),
            new("SBI-FIP", "State Bank of India", "SBIN0004567"),
            new("ICICI-FIP", "ICICI Bank", "ICIC0000789"),
            new("AXIS-FIP", "Axis Bank", "UTIB0000321"),
            new("KOTAK-FIP", "Kotak Mahindra Bank", "KKBK0000654"),
        ];

        private static readonly (string Merchant, string Vpa, int Min, int Max)[] Spends =
        [
            ("SWIGGY", "swiggy@icici", 180, 900),
            ("ZOMATO", "zomato@hdfcbank", 200, 1100),
            ("BIGBASKET", "bigbasket@axisbank", 600, 3500),
            ("UBER INDIA", "uber@axisbank", 120, 750),
            ("AMAZON PAY", "amazonpay@apl", 300, 6000),
            ("FLIPKART", "flipkart@axisbank", 400, 5000),
            ("DMART", "dmart@ybl", 500, 4000),
            ("IRCTC", "irctc@sbi", 450, 3200),
            ("APOLLO PHARMACY", "apollo@icici", 150, 1800),
            ("JIO RECHARGE", "jio@sbi", 239, 999),
            ("BOOKMYSHOW", "bookmyshow@icici", 300, 1600),
            ("BLINKIT", "blinkit@hdfcbank", 150, 1400),
        ];

        // Schemes and NAVs from contracts/fixtures/amfi/navall_sample.txt, so the
        // app can value them with Market Data's sample file.
        private static readonly (string Isin, string Code, string Name, decimal Nav)[] Schemes =
        [
            ("INF879O01027", "122639", "Parag Parikh Flexi Cap Fund - Direct Plan - Growth Option", 89.1234m),
            ("INF209K01173", "119552", "Aditya Birla Sun Life Banking & PSU Debt Fund - Direct Plan - Growth Option", 345.6789m),
            ("INF966L01689", "120828", "quant Small Cap Fund - Direct Plan - Growth Option", 265.0m),
        ];

        private static readonly (string Isin, string Symbol, string Issuer, string Kind, decimal Price)[] Stocks =
        [
            ("INE002A01018", "RELIANCE", "Reliance Industries Ltd", "EQUITY", 2875.40m),
            ("INE467B01029", "TCS", "Tata Consultancy Services Ltd", "EQUITY", 4012.15m),
            ("INE040A01034", "HDFCBANK", "HDFC Bank Ltd", "EQUITY", 1689.90m),
            ("INE009A01021", "INFY", "Infosys Ltd", "EQUITY", 1854.30m),
            ("INF204KB14I2", "NIFTYBEES", "Nippon India ETF Nifty 50 BeES", "ETF", 268.45m),
            ("INF204KB17I5", "GOLDBEES", "Nippon India ETF Gold BeES", "ETF", 64.20m),
        ];

        public static FiBundle Build(FiFetchContext ctx, int seed)
        {
            var types = ctx.FiTypes.ToHashSet(StringComparer.Ordinal);
            // Accounts depend on the user only; activity also on the window.
            var who = new Random(seed);
            var primary = Banks[who.Next(Banks.Length)];
            var secondary = Banks[(Array.IndexOf(Banks, primary) + 1 + who.Next(Banks.Length - 1)) % Banks.Length];
            var salary = 45_000 + (who.Next(0, 40) * 2_500);
            var rent = 12_000 + (who.Next(0, 16) * 1_000);
            var opening = 60_000 + who.Next(0, 120_000);
            var masked = (int n) => $"XXXXXXXX{(n % 10_000).ToString("D4", CultureInfo.InvariantCulture)}";
            var accountNo = who.Next(1000, 9999);

            var deposits = new List<DepositAccount>();
            if (types.Contains(FiTypes.Deposit))
            {
                deposits.Add(Savings(primary, accountNo, masked(accountNo), opening, salary, rent, ctx, seed));
                deposits.Add(Savings(secondary, accountNo + 1111, masked(accountNo + 1111), opening / 4, 0, 0, ctx, seed ^ 0x5bd1e995));
            }

            var termDeposits = new List<TermDepositAccount>();
            if (types.Contains(FiTypes.TermDeposit))
            {
                var principal = 100_000m + (who.Next(0, 8) * 50_000m);
                var rate = 6.50m + (who.Next(0, 10) * 0.10m);
                var opened = ctx.To.AddDays(-who.Next(60, 300));
                var matures = opened.AddYears(1);
                var maturity = Math.Round(principal * (1 + (rate / 100m)), 2);
                var elapsed = (decimal)(ctx.To.DayNumber - opened.DayNumber) / 365m;
                termDeposits.Add(new TermDepositAccount($"LINK-FD-{seed & 0xffff:x4}", primary.FipId, primary.Name, masked(accountNo + 2222),
                    "TERM", Money(principal), Rate(rate), opened, matures, Money(maturity),
                    Money(Math.Round(principal * (1 + (rate / 100m * elapsed)), 2)), null));
            }
            if (types.Contains(FiTypes.RecurringDeposit))
            {
                var instalment = 5_000m + (who.Next(0, 6) * 1_000m);
                var opened = ctx.To.AddMonths(-who.Next(3, 11));
                var months = ((ctx.To.Year - opened.Year) * 12) + ctx.To.Month - opened.Month;
                termDeposits.Add(new TermDepositAccount($"LINK-RD-{seed & 0xffff:x4}", primary.FipId, primary.Name, masked(accountNo + 3333),
                    "RECURRING", Money(instalment * 12), Rate(6.80m), opened, opened.AddYears(1),
                    Money(Math.Round(instalment * 12 * 1.037m, 2)), Money(Math.Round(instalment * months * 1.018m, 2)), Money(instalment)));
            }

            var funds = new List<MutualFundFolio>();
            if (types.Contains(FiTypes.MutualFunds))
            {
                var navDate = new DateOnly(2026, 10, 17);
                var holdings = Schemes.Select(s =>
                {
                    var units = Math.Round(50m + (who.Next(0, 4000) / 10m), 3);
                    var value = Math.Round(units * s.Nav, 2);
                    var cost = Math.Round(value * (0.82m + (who.Next(0, 20) / 100m)), 2);
                    return new MutualFundHolding(s.Isin, s.Code, s.Name, units.ToString("0.000", CultureInfo.InvariantCulture),
                        s.Nav.ToString("0.0000", CultureInfo.InvariantCulture), navDate, Money(cost), Money(value));
                }).ToList();
                funds.Add(new MutualFundFolio($"LINK-MF-{seed & 0xffff:x4}", "CAMS-FIP", "CAMS (RTA)",
                    $"XXXXXX{who.Next(1000, 9999).ToString(CultureInfo.InvariantCulture)}/12", holdings));
            }

            var demat = new List<DematAccount>();
            if (types.Contains(FiTypes.Equities) || types.Contains(FiTypes.Etf))
            {
                var holdings = Stocks
                    .Where(s => (s.Kind == "EQUITY" && types.Contains(FiTypes.Equities)) || (s.Kind == "ETF" && types.Contains(FiTypes.Etf)))
                    .Select(s =>
                    {
                        var qty = who.Next(1, 60);
                        return new EquityHolding(s.Isin, s.Symbol, s.Issuer, "NSE", s.Kind, qty.ToString(CultureInfo.InvariantCulture),
                            Money(s.Price), Money(qty * s.Price));
                    }).ToList();
                demat.Add(new DematAccount($"LINK-DEMAT-{seed & 0xffff:x4}", "CDSL-FIP", "CDSL",
                    $"XXXXXXXXXXXX{who.Next(1000, 9999).ToString(CultureInfo.InvariantCulture)}", holdings));
            }

            var nps = new List<NpsAccount>();
            if (types.Contains(FiTypes.Nps))
                nps.Add(new NpsAccount($"LINK-NPS-{seed & 0xffff:x4}", "PFRDA-CRA-FIP", "Protean CRA",
                    $"XXXXXXXX{who.Next(1000, 9999).ToString(CultureInfo.InvariantCulture)}", "TIER_I",
                    Money(150_000m + (who.Next(0, 60) * 10_000m)), ctx.To));

            var retirement = new List<RetirementAccount>();
            if (types.Contains(FiTypes.Epf))
            {
                var employee = 1_800m * 12 * (2 + who.Next(0, 6));
                retirement.Add(new RetirementAccount($"LINK-EPF-{seed & 0xffff:x4}", "EPFO-FIP", "EPFO", "EPF",
                    $"XXXXXXXX{who.Next(1000, 9999).ToString(CultureInfo.InvariantCulture)}", "Acme Technologies Pvt Ltd",
                    Money(employee), Money(Math.Round(employee * 0.3673m, 2)), Money(Math.Round(employee * 0.6327m, 2)),
                    Money(Math.Round(employee * 2m * 1.08m, 2)), ctx.To));
            }
            if (types.Contains(FiTypes.Ppf))
                retirement.Add(new RetirementAccount($"LINK-PPF-{seed & 0xffff:x4}", primary.FipId, primary.Name, "PPF",
                    masked(accountNo + 4444), null, null, null, null, Money(80_000m + (who.Next(0, 40) * 12_500m)), ctx.To));

            var insurance = new List<InsurancePolicy>();
            if (types.Contains(FiTypes.Insurance))
            {
                var started = ctx.To.AddYears(-who.Next(1, 6));
                insurance.Add(new InsurancePolicy($"LINK-INS-T-{seed & 0xffff:x4}", "HDFCLIFE-FIP", "HDFC Life", $"XXXXXX{who.Next(1000, 9999)}",
                    "TERM", "Click 2 Protect Super", Money(10_000_000m), Money(14_160m), "YEARLY", started, NextDue(started, ctx.To, 12), started.AddYears(35)));
                insurance.Add(new InsurancePolicy($"LINK-INS-H-{seed & 0xffff:x4}", "STARHEALTH-FIP", "Star Health", $"XXXXXX{who.Next(1000, 9999)}",
                    "HEALTH", "Family Health Optima", Money(500_000m), Money(2_150m), "MONTHLY", started, NextDue(started, ctx.To, 1), null));
            }

            return new FiBundle(FiBundle.Kind, ctx.ConsentId, ctx.Now, ctx.From, ctx.To,
                deposits, termDeposits, funds, demat, nps, retirement, insurance);
        }

        private static DepositAccount Savings(Bank bank, int number, string maskedNumber, decimal opening, decimal salary, decimal rent, FiFetchContext ctx, int seed)
        {
            var transactions = new List<DepositTransaction>();
            var balance = opening;
            var seq = 0;
            for (var day = ctx.From; day <= ctx.To; day = day.AddDays(1))
            {
                // Each day's activity is seeded by the user, the account and the date
                // (HashCode.Combine is randomised per process, so not that).
                var rng = new Random(unchecked((((seed * 31) + number) * 31) + day.DayNumber));
                if (salary > 0 && day.Day == 1)
                    Add("CREDIT", "NEFT", salary, $"NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY {day.AddMonths(-1).ToString("MMM yyyy", CultureInfo.InvariantCulture).ToUpperInvariant()}", 9, rng);
                if (rent > 0 && day.Day == 5)
                    Add("DEBIT", "IMPS", rent, "IMPS/P2A/RENT/LANDLORD", 10, rng);
                if (salary > 0 && day.Day == 10)
                    Add("DEBIT", "ACH", 5_000, "ACH D- BSE LTD-SIP PARAG PARIKH", 7, rng);
                if (salary > 0 && day.Day == 18)
                    Add("DEBIT", "OTHERS", Math.Round(salary * 0.18m), "CC BILLPAY HDFC CREDIT CARD XX4521", 20, rng);
                if (day.Day == 12)
                    Add("DEBIT", "UPI", 900 + rng.Next(0, 2_200), "UPI/BESCOM/electricity@bescom/Bill payment", 19, rng);
                if (day.Day % 9 == 3)
                    Add("CREDIT", "UPI", 200 + rng.Next(0, 1_800), "UPI/FRIEND/split@okaxis/Dinner split", 21, rng);
                if (rng.Next(0, 30) == 0)
                    Add("DEBIT", "ATM", 2_000 * rng.Next(1, 4), $"ATW-{bank.Ifsc[..4]}-ATM WDL", 14, rng);
                var spends = salary > 0 ? rng.Next(0, 3) : rng.Next(0, 2);
                for (var i = 0; i < spends; i++)
                {
                    var spend = Spends[rng.Next(Spends.Length)];
                    Add("DEBIT", "UPI", rng.Next(spend.Min, spend.Max), $"UPI/{spend.Merchant}/{spend.Vpa}/Payment", 8 + rng.Next(0, 14), rng);
                }
                if (day.Day == DateTime.DaysInMonth(day.Year, day.Month) && day.Month % 3 == 0)
                    Add("CREDIT", "OTHERS", Math.Round(balance * 0.0075m, 2), "CREDIT INTEREST CAPITALISED", 23, rng);

                void Add(string type, string mode, decimal amount, string narration, int hour, Random r)
                {
                    if (type == "DEBIT" && amount > balance) return;
                    balance += type == "CREDIT" ? amount : -amount;
                    var local = day.ToDateTime(new TimeOnly(Math.Clamp(hour, 0, 23), r.Next(0, 60), r.Next(0, 60)));
                    var at = new DateTimeOffset(local, IndiaTime.Offset);
                    var reference = mode == "UPI"
                        ? r.NextInt64(100_000_000_000, 999_999_999_999).ToString(CultureInfo.InvariantCulture)
                        : $"{bank.Ifsc[..4]}N{day:yyyyMMdd}{r.Next(100_000, 999_999).ToString(CultureInfo.InvariantCulture)}";
                    transactions.Add(new DepositTransaction(
                        $"T{number}{day:yyyyMMdd}{seq++:D3}", type, mode, Money(amount), Money(balance), at, day, narration, reference));
                }
            }
            return new DepositAccount($"LINK-SB-{number}", bank.FipId, bank.Name, maskedNumber, "SAVINGS", bank.Ifsc, "INR",
                Money(balance), new DateTimeOffset(ctx.To.ToDateTime(new TimeOnly(23, 59)), IndiaTime.Offset), transactions);
        }

        private static DateOnly NextDue(DateOnly started, DateOnly today, int months)
        {
            var due = started;
            while (due <= today) due = due.AddMonths(months);
            return due;
        }

        private static string Money(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);

        private static string Rate(decimal rate) => rate.ToString("0.00", CultureInfo.InvariantCulture);
    }
}
