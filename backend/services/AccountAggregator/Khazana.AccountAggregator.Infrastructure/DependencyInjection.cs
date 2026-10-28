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
            case "Setu":
                AddSetu(services, configuration, environment);
                break;
            case "Finvu":
                throw new InvalidOperationException($"{ProviderKey}=Finvu: the Finvu adapter is not built yet (TODO P4). Use Fake.");
            default:
                throw new InvalidOperationException($"Unknown {ProviderKey} value '{choice}'. Use Fake or Setu.");
        }
        return services;
    }

    /// <summary>
    /// The Setu gateway. Refuses to start without its credentials, with a
    /// non-HTTPS address, or — in Production — pointed at Setu's sandbox, which
    /// would serve Setu's mock bank data as real.
    /// </summary>
    private static void AddSetu(IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var options = configuration.GetSection(SetuAaOptions.Section).Get<SetuAaOptions>() ?? new();
        string[] missing = [
            .. new[] { (nameof(options.ClientId), options.ClientId), (nameof(options.ClientSecret), options.ClientSecret), (nameof(options.ProductInstanceId), options.ProductInstanceId) }
                .Where(x => string.IsNullOrWhiteSpace(x.Item2)).Select(x => $"{SetuAaOptions.Section}:{x.Item1}"),
        ];
        if (missing.Length > 0)
            throw new InvalidOperationException($"{ProviderKey}=Setu needs {string.Join(", ", missing)} (from the Setu Bridge; set them as environment variables).");
        if (!IsHttps(options.BaseUrl)) throw new InvalidOperationException($"{SetuAaOptions.Section}:BaseUrl must be an https URL.");
        if (!string.Equals(options.Auth, "Headers", StringComparison.OrdinalIgnoreCase) && !IsHttps(options.TokenUrl))
            throw new InvalidOperationException($"{SetuAaOptions.Section}:TokenUrl must be an https URL.");
        if (options.Auth is not ("Token" or "Headers"))
            throw new InvalidOperationException($"{SetuAaOptions.Section}:Auth must be Token or Headers.");
        if (options.RedirectUrl is { Length: > 0 } back && !IsHttps(back) && !IsLocal(back))
            throw new InvalidOperationException($"{SetuAaOptions.Section}:RedirectUrl must be an https URL.");
        if (environment.IsProduction() && new Uri(options.BaseUrl).Host.Contains("sandbox", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{SetuAaOptions.Section}:BaseUrl is Setu's sandbox, which is not allowed in Production: it would serve mock bank data as real.");
        if (options.TimeoutSeconds is < 1 or > 120) throw new InvalidOperationException($"{SetuAaOptions.Section}:TimeoutSeconds must be 1-120.");
        if (options.DataLifeDays is < 1 or > 365) throw new InvalidOperationException($"{SetuAaOptions.Section}:DataLifeDays must be 1-365.");

        services.AddSingleton(options);
        services.AddHttpClient(SetuBankDataProvider.HttpClientName, c =>
        {
            c.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
            c.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        });
        services.AddSingleton<IBankDataProvider, SetuBankDataProvider>();
    }

    /// <summary>A web app on this machine (the demo's Mac tunnel): plain http never leaves it.</summary>
    private static bool IsLocal(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttp && u.IsLoopback;

    private static bool IsHttps(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps;
}
