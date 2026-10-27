namespace Khazana.Credit.Domain;

// The normalised credit report every bureau's response is turned into before
// sealing (design doc §8.6). The server holds it only in memory for the
// seconds it takes to seal it; credit_pulls records only that a pull
// happened. No PAN, no full account numbers: masked last four at most.
// Money is a decimal string (§7.3).

/// <param name="Sample">True when it came from the sample provider, so the app can label it.</param>
public sealed record CreditReport(
    string Schema,
    string Bureau,
    string ReportId,
    DateTimeOffset GeneratedAt,
    bool Sample,
    CreditScore Score,
    CreditSummary Summary,
    IReadOnlyList<CreditAccount> Accounts,
    IReadOnlyList<CreditEnquiry> Enquiries)
{
    public const string Kind = "credit.report.v1";
}

/// <param name="Factors">Short bureau reason codes behind the score, most important first.</param>
public sealed record CreditScore(int Value, int Min, int Max, string Model, IReadOnlyList<string> Factors);

/// <param name="Utilisation">Card balances over card limits, as a percentage string.</param>
public sealed record CreditSummary(
    int TotalAccounts,
    int ActiveAccounts,
    int OverdueAccounts,
    string TotalBalance,
    string TotalOverdue,
    string Utilisation,
    int EnquiriesLast6Months);

/// <param name="AccountType"><c>CREDIT_CARD</c>, <c>PERSONAL_LOAN</c>, <c>HOME_LOAN</c>, <c>AUTO_LOAN</c>, <c>CONSUMER_LOAN</c> or <c>GOLD_LOAN</c>.</param>
/// <param name="PaymentHistory">Days past due per month, newest first: <c>0</c> on time, <c>30</c>, <c>60</c>, <c>90</c>.</param>
public sealed record CreditAccount(
    string Lender,
    string AccountType,
    string MaskedNumber,
    string Ownership,
    string Status,
    DateOnly OpenedOn,
    DateOnly? ClosedOn,
    string? CreditLimit,
    string? SanctionedAmount,
    string CurrentBalance,
    string AmountOverdue,
    string? Emi,
    DateOnly ReportedOn,
    IReadOnlyList<int> PaymentHistory);

public sealed record CreditEnquiry(string Lender, string Purpose, DateOnly On, string? Amount);
