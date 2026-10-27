using Khazana.Credit.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.Credit.Infrastructure;

public static class DependencyInjection
{
    public const string ProviderKey = "Providers:Credit";

    /// <summary>
    /// Registers the configured <see cref="ICreditReportProvider"/>. Throws at
    /// startup if the choice is unknown, or if a Production host is configured
    /// to serve the sample report as if it were a real one (ADR 0003's guard).
    /// </summary>
    /// <remarks>
    /// The paid adapter (a licensed bureau aggregator: Surepass, Decentro,
    /// Signzy or Perfios, design doc §12) is not chosen or built yet; it slots
    /// in here as one more case.
    /// </remarks>
    public static IServiceCollection AddCreditInfrastructure(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        var choice = configuration[ProviderKey] ?? "Fake";
        switch (choice)
        {
            case "Fake" when environment.IsProduction():
                throw new InvalidOperationException(
                    $"{ProviderKey}=Fake is not allowed in Production: it would serve a sample credit report as real.");
            case "Fake":
                services.AddSingleton<ICreditReportProvider, FakeCreditReportProvider>();
                break;
            default:
                throw new InvalidOperationException($"Unknown {ProviderKey} value '{choice}'. Use Fake (no bureau adapter is built yet).");
        }
        return services;
    }
}
