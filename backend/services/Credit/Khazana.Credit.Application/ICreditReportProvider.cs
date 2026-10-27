using System.Text;
using Khazana.Credit.Domain;

namespace Khazana.Credit.Application;

/// <summary>
/// The credit bureau, through a licensed aggregator (design doc §13.3,
/// decision D15): a sample report now, the aggregator's sandbox next, a paid
/// bureau pull in production. Chosen by <c>Providers:Credit</c>.
/// </summary>
/// <remarks>
/// One call is one billable pull, so the report, its score and its accounts
/// come back together in one <see cref="CreditReport"/>, never as three calls.
/// </remarks>
public interface ICreditReportProvider
{
    /// <summary>Stored with each pull record.</summary>
    string Name { get; }

    /// <summary>Pulls, normalises and returns the report. Plaintext, in memory only, until the caller seals it.</summary>
    Task<CreditReport> FetchReportAsync(CreditReportRequest request, CancellationToken ct);
}

/// <summary>
/// What the bureau needs for one pull. PAN and mobile are used for this call
/// only (§8.6): never stored, and redacted from <see cref="ToString"/> so a
/// log line can't leak them.
/// </summary>
public sealed record CreditReportRequest(
    Guid PullId,
    string Pan,
    string Mobile,
    string? FullName,
    string ConsentTextVersion,
    string Purpose,
    DateTimeOffset RequestedAt)
{
    private bool PrintMembers(StringBuilder builder)
    {
        builder.Append("PullId = ").Append(PullId).Append(", Pan = ***, Mobile = ***, ConsentTextVersion = ").Append(ConsentTextVersion);
        return true;
    }
}

/// <summary>The bureau refused or failed. The pull is recorded as failed and does not count towards the 30-day limit.</summary>
public sealed class CreditProviderException : Exception
{
    public CreditProviderException(string code, string message) : base(message) => Code = code;

    public CreditProviderException() : this("provider_error", "The credit provider failed.") { }

    public CreditProviderException(string message) : this("provider_error", message) { }

    public CreditProviderException(string message, Exception inner) : base(message, inner) => Code = "provider_error";

    /// <summary>A short code safe to store, e.g. <c>provider_unavailable</c>, <c>no_record</c>.</summary>
    public string Code { get; } = "provider_error";
}
