using Microsoft.Extensions.DependencyInjection;

namespace Khazana.AuditReporting.Infrastructure;

public static class DependencyInjection
{
    /// <summary>No adapters yet; the nightly export of the audit log to S3 Object Lock arrives with the cloud slice.</summary>
    public static IServiceCollection AddReportingInfrastructure(this IServiceCollection services) => services;
}
