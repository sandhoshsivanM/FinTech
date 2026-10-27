using Khazana.AuditReporting.Domain;
using Khazana.Messaging.Contracts;

namespace Khazana.AuditReporting.Application;

/// <summary>
/// Account Aggregator and Credit events into the audit log (design doc §8.3:
/// Reporting consumes ConsentActivated, ConsentRevoked and CreditReportReady).
/// Ids, a status word and an error code only: the events carry nothing else,
/// and Reporting has no route to the data itself (§8.10).
/// </summary>
public static class BankDataAuditHandler
{
    public static Task Handle(ConsentActivatedV1 m, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "aa.consent_activated", $"consent:{m.ConsentId}", null), ct);
    }

    /// <summary>Revoked, expired, rejected or paused: the status is the reason.</summary>
    public static Task Handle(ConsentRevokedV1 m, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "aa.consent_ended", $"consent:{m.ConsentId}", Code(m.Status)), ct);
    }

    public static Task Handle(AaFetchFailedV1 m, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, "system:aa", "aa.fetch_failed", $"consent:{m.ConsentId}", Code(m.ErrorCode)), ct);
    }

    public static Task Handle(CreditReportReadyV1 m, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "credit.report_pulled", $"payload:{m.PayloadId}", null), ct);
    }

    public static Task Handle(CreditConsentWithdrawnV1 m, AuditWriter audit, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(m);
        ArgumentNullException.ThrowIfNull(audit);
        return audit.AppendAsync(new AuditEntry(m.At, $"user:{m.UserId}", "credit.consent_withdrawn", $"user:{m.UserId}", null), ct);
    }

    /// <summary>A short code from another service, kept short and printable so it can't break the audit entry's rules.</summary>
    private static string? Code(string? value) =>
        string.IsNullOrEmpty(value) ? null : new string([.. value.Where(c => !char.IsControl(c)).Take(64)]);
}
