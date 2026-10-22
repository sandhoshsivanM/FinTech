using Khazana.MarketData.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.MarketData.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the configured <see cref="INavSource"/>. Throws at startup,
    /// not at the first request, if the choice is unknown — or if a Production
    /// host is configured to serve fixture data as if it were real prices.
    /// </summary>
    public static IServiceCollection AddNavSource(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        var options = configuration.GetSection(NavSourceOptions.Section).Get<NavSourceOptions>() ?? new();
        services.AddSingleton(options);

        switch (options.Nav)
        {
            case "Amfi":
                services.AddHttpClient<INavSource, AmfiNavSource>();
                break;
            case "Fixture" when environment.IsProduction():
                throw new InvalidOperationException(
                    "Providers:Nav=Fixture is not allowed in Production: it would publish sample data as real prices.");
            case "Fixture":
                services.AddSingleton<INavSource, FixtureNavSource>();
                break;
            default:
                throw new InvalidOperationException($"Unknown Providers:Nav value '{options.Nav}'. Use Amfi or Fixture.");
        }
        return services;
    }
}
