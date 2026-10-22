using Khazana.Identity.Application;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Khazana.Identity.Api;

/// <summary>
/// Identity checks its own tokens with its own keys, in memory; other services
/// fetch the same public keys from <c>/.well-known/jwks.json</c>.
/// </summary>
public sealed class LocalKeysConfigurationManager(ISigningKeys keys) : IConfigurationManager<OpenIdConnectConfiguration>
{
    public Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel)
    {
        var config = new OpenIdConnectConfiguration();
        foreach (var key in keys.ValidationKeys) config.SigningKeys.Add(key);
        return Task.FromResult(config);
    }

    public void RequestRefresh()
    {
    }
}
