using Microsoft.Extensions.DependencyInjection;

namespace Khazana.Devices.Infrastructure;

public static class DependencyInjection
{
    /// <summary>No adapters yet; push-provider and attestation adapters arrive with Notification and hardening.</summary>
    public static IServiceCollection AddDevicesInfrastructure(this IServiceCollection services) => services;
}
