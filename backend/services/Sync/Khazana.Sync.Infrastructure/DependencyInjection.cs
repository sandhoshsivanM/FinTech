using Microsoft.Extensions.DependencyInjection;

namespace Khazana.Sync.Infrastructure;

public static class DependencyInjection
{
    /// <summary>No adapters yet; the attachment store (S3 presigned URLs, local disk in development) arrives next.</summary>
    public static IServiceCollection AddSyncInfrastructure(this IServiceCollection services) => services;
}
