using Khazana.AccountAggregator.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.AccountAggregator.Infrastructure;

public static class DependencyInjection
{
    public const string ProviderKey = "Providers:AccountAggregator";

    /// <summary>
    /// Registers the configured <see cref="IBankDataProvider"/>. Throws at
    /// startup, not at the first request, if the choice is unknown or not
    /// built — or if a Production host is configured to serve sample bank
    /// data as if it were real (ADR 0003's guard).
    /// </summary>
    public static IServiceCollection AddAccountAggregatorInfrastructure(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        var choice = configuration[ProviderKey] ?? "Fake";
        switch (choice)
        {
            case "Fake" when environment.IsProduction():
                throw new InvalidOperationException(
                    $"{ProviderKey}=Fake is not allowed in Production: it would serve sample bank data as real.");
            case "Fake":
                var options = configuration.GetSection(FakeAaOptions.Section).Get<FakeAaOptions>() ?? new();
                if (string.IsNullOrEmpty(options.CallbackSecret) && !environment.IsDevelopment())
                    throw new InvalidOperationException(
                        $"{FakeAaOptions.Section}:CallbackSecret must be set outside Development, or anyone could forge callbacks.");
                if (options.CallbackSecret is { Length: < 32 })
                    throw new InvalidOperationException($"{FakeAaOptions.Section}:CallbackSecret must be at least 32 characters.");
                services.AddSingleton(options);
                services.AddSingleton<IBankDataProvider, FakeBankDataProvider>();
                break;
            case "Finvu":
                throw new InvalidOperationException($"{ProviderKey}=Finvu: the Finvu adapter is not built yet (TODO P4). Use Fake.");
            default:
                throw new InvalidOperationException($"Unknown {ProviderKey} value '{choice}'. Use Fake.");
        }
        return services;
    }
}
