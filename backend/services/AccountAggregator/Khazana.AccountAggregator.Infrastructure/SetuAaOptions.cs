namespace Khazana.AccountAggregator.Infrastructure;

/// <summary>
/// Settings for the Setu Account Aggregator gateway (<c>Providers:Setu</c>).
/// Credentials come from Setu's Bridge (bridge.setu.co) and are set as
/// environment variables, never committed: <c>Providers__Setu__ClientId</c>,
/// <c>Providers__Setu__ClientSecret</c>, <c>Providers__Setu__ProductInstanceId</c>.
/// </summary>
public sealed class SetuAaOptions
{
    public const string Section = "Providers:Setu";
    public const string SandboxBaseUrl = "https://fiu-sandbox.setu.co";
    public const string ProductionBaseUrl = "https://fiu.setu.co";

    /// <summary>Setu's token endpoint for Bridge API credentials (client-credentials grant).</summary>
    public const string DefaultTokenUrl = "https://orgservice-prod.setu.co/v1/users/login";

    /// <summary>The FIU API. Sandbox by default; Production refuses the sandbox.</summary>
    public string BaseUrl { get; set; } = SandboxBaseUrl;

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }

    /// <summary>The AA Data product's id on the Bridge, sent as <c>x-product-instance-id</c>.</summary>
    public string? ProductInstanceId { get; set; }

    /// <summary>
    /// <c>Token</c> (default): exchange the client id and secret for a short-lived
    /// bearer token at <see cref="TokenUrl"/>. <c>Headers</c>: send them as
    /// <c>x-client-id</c> / <c>x-client-secret</c> on every call, for products
    /// the Bridge still issues header credentials for.
    /// </summary>
    public string Auth { get; set; } = "Token";

    public string TokenUrl { get; set; } = DefaultTokenUrl;

    /// <summary>Where Setu sends the user back after the consent screen: the online app's link page.</summary>
    public string? RedirectUrl { get; set; }

    /// <summary>The ReBIT purpose code. 102: customer spending patterns, budget or other reportings.</summary>
    public string Purpose { get; set; } = "102";

    /// <summary>How long Setu's FIU may keep fetched data. The server keeps only sealed bytes, for at most 14 days.</summary>
    public int DataLifeDays { get; set; } = 30;

    /// <summary>Per-call timeout. The fetch saga retries transient failures.</summary>
    public int TimeoutSeconds { get; set; } = 30;
}
