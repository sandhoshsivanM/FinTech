using Khazana.Notification.Application;
using Khazana.Notification.Domain;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.Notification.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// <c>Providers:Push</c> = <c>Log</c> (development: nothing leaves the
    /// machine) or <c>Real</c> (FCM and/or APNs, each enabled by its secrets).
    /// Log in Production would silently drop every alert, so startup refuses it.
    /// </summary>
    public static IServiceCollection AddNotificationInfrastructure(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        services.AddSingleton(TimeProvider.System);
        var mode = configuration["Providers:Push"] ?? "Log";
        switch (mode)
        {
            case "Log" when environment.IsProduction():
                throw new InvalidOperationException(
                    "Providers:Push=Log is not allowed in Production: every alert would be dropped.");
            case "Log":
                services.AddSingleton<PushLog>();
                foreach (var provider in PushProviders.Known)
                    services.AddSingleton<IPushSender>(sp => new LogPushSender(provider, sp.GetRequiredService<PushLog>()));
                break;
            case "Real":
                var fcmPath = configuration["Push:Fcm:ServiceAccountPath"];
                if (!string.IsNullOrEmpty(fcmPath))
                {
                    var fcm = FcmOptions.FromServiceAccountJson(File.ReadAllText(fcmPath));
                    services.AddHttpClient(nameof(FcmPushSender));
                    services.AddSingleton<IPushSender>(sp => new FcmPushSender(
                        sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(FcmPushSender)), fcm, sp.GetRequiredService<TimeProvider>()));
                }
                var apnsKey = configuration["Push:Apns:KeyPath"];
                if (!string.IsNullOrEmpty(apnsKey))
                {
                    var apns = new ApnsOptions
                    {
                        TeamId = configuration["Push:Apns:TeamId"] ?? throw new InvalidOperationException("Push:Apns:TeamId is not set."),
                        KeyId = configuration["Push:Apns:KeyId"] ?? throw new InvalidOperationException("Push:Apns:KeyId is not set."),
                        BundleId = configuration["Push:Apns:BundleId"] ?? throw new InvalidOperationException("Push:Apns:BundleId is not set."),
                        PrivateKeyPem = File.ReadAllText(apnsKey),
                        UseSandbox = configuration.GetValue("Push:Apns:UseSandbox", false),
                    };
                    services.AddHttpClient(nameof(ApnsPushSender));
                    services.AddSingleton<IPushSender>(sp => new ApnsPushSender(
                        sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(ApnsPushSender)), apns, sp.GetRequiredService<TimeProvider>()));
                }
                var vapidKey = configuration["Push:WebPush:VapidKeyPath"];
                if (!string.IsNullOrEmpty(vapidKey))
                {
                    var webPush = new WebPushOptions
                    {
                        PrivateKeyPem = File.ReadAllText(vapidKey),
                        Subject = configuration["Push:WebPush:Subject"] ?? throw new InvalidOperationException("Push:WebPush:Subject is not set."),
                    };
                    services.AddHttpClient(nameof(WebPushSender));
                    services.AddSingleton<IPushSender>(sp => new WebPushSender(
                        sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(WebPushSender)), webPush, sp.GetRequiredService<TimeProvider>()));
                }
                break;
            default:
                throw new InvalidOperationException($"Unknown Providers:Push '{mode}'. Use Log or Real.");
        }
        return services;
    }
}
