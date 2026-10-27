namespace Khazana.AccountAggregator.Domain;

// The normalised shape every provider's data is turned into before sealing
// (design doc §8.5, Sealed: "Normalised to Khazana DTOs"). The app imports
// this; the server only ever holds it in memory for the seconds it takes to
// seal it. Money is a decimal string (§7.3), never a float. Account, folio,
// policy and member numbers are masked, as the AA framework delivers them.

/// <summary>Everything one fetch returned, across the FI types the consent covers.</summary>
/// <param name="Schema">The payload format: <see cref="Kind"/>.</param>
public sealed record FiBundle(
    string Schema,
    Guid ConsentId,
    DateTimeOffset FetchedAt,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<DepositAccount> Deposits,
    IReadOnlyList<TermDepositAccount> TermDeposits,
    IReadOnlyList<MutualFundFolio> MutualFunds,
    IReadOnlyList<DematAccount> Equities,
    IReadOnlyList<NpsAccount> Nps,
    IReadOnlyList<RetirementAccount> Retirement,
    IReadOnlyList<InsurancePolicy> Insurance)
{
    public const string Kind = "aa.fi-bundle.v1";

    public int AccountCount =>
        Deposits.Count + TermDeposits.Count + MutualFunds.Count + Equities.Count + Nps.Count + Retirement.Count + Insurance.Count;
}

/// <param name="LinkRef">The AA's stable reference for the linked account; the app's account-matching key.</param>
/// <param name="AccountType"><c>SAVINGS</c> or <c>CURRENT</c>.</param>
public sealed record DepositAccount(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedAccountNumber,
    string AccountType,
    string? Ifsc,
    string Currency,
    string CurrentBalance,
    DateTimeOffset BalanceAt,
    IReadOnlyList<DepositTransaction> Transactions);

/// <param name="Type"><c>CREDIT</c> or <c>DEBIT</c>.</param>
/// <param name="Mode"><c>UPI</c>, <c>CARD</c>, <c>NEFT</c>, <c>IMPS</c>, <c>ATM</c>, <c>ACH</c> or <c>OTHERS</c>.</param>
/// <param name="Reference">UTR or bank reference: the app's dedupe key against SMS captures.</param>
public sealed record DepositTransaction(
    string TxnId,
    string Type,
    string Mode,
    string Amount,
    string BalanceAfter,
    DateTimeOffset At,
    DateOnly ValueDate,
    string Narration,
    string Reference);

/// <param name="Kind"><c>TERM</c> (FD) or <c>RECURRING</c> (RD).</param>
public sealed record TermDepositAccount(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedAccountNumber,
    string Kind,
    string Principal,
    string InterestRate,
    DateOnly OpenedOn,
    DateOnly MaturesOn,
    string MaturityAmount,
    string CurrentValue,
    string? MonthlyInstalment);

public sealed record MutualFundFolio(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedFolio,
    IReadOnlyList<MutualFundHolding> Holdings);

/// <param name="SchemeCode">AMFI scheme code, so the app can value it with Market Data's NAV file.</param>
public sealed record MutualFundHolding(
    string Isin,
    string SchemeCode,
    string SchemeName,
    string Units,
    string Nav,
    DateOnly NavDate,
    string CostValue,
    string CurrentValue);

public sealed record DematAccount(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedDematId,
    IReadOnlyList<EquityHolding> Holdings);

/// <param name="Kind"><c>EQUITY</c> or <c>ETF</c>.</param>
public sealed record EquityHolding(
    string Isin,
    string Symbol,
    string IssuerName,
    string Exchange,
    string Kind,
    string Units,
    string LastPrice,
    string CurrentValue);

public sealed record NpsAccount(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedPran,
    string Tier,
    string TotalValue,
    DateOnly AsOf);

/// <param name="Kind"><c>EPF</c> or <c>PPF</c>.</param>
/// <param name="EmployeeShare">EPF only.</param>
/// <param name="EmployerShare">EPF only.</param>
/// <param name="PensionShare">EPF only (EPS).</param>
public sealed record RetirementAccount(
    string LinkRef,
    string FipId,
    string FipName,
    string Kind,
    string MaskedNumber,
    string? Establishment,
    string? EmployeeShare,
    string? EmployerShare,
    string? PensionShare,
    string TotalBalance,
    DateOnly AsOf);

/// <param name="PolicyType"><c>TERM</c>, <c>HEALTH</c>, <c>ENDOWMENT</c> or <c>ULIP</c>.</param>
/// <param name="PremiumFrequency"><c>MONTHLY</c>, <c>QUARTERLY</c>, <c>HALF_YEARLY</c> or <c>YEARLY</c>.</param>
public sealed record InsurancePolicy(
    string LinkRef,
    string FipId,
    string FipName,
    string MaskedPolicyNumber,
    string PolicyType,
    string PlanName,
    string SumAssured,
    string Premium,
    string PremiumFrequency,
    DateOnly StartedOn,
    DateOnly? NextPremiumDue,
    DateOnly? MaturesOn);
