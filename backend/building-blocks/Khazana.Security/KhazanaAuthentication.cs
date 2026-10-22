using System.Security.Claims;
using System.Text.Json;
using Khazana.Security.Dpop;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Khazana.Security;

/// <summary>Settings under <c>Auth</c>, the same for every service.</summary>
public sealed class KhazanaAuthOptions
{
    public const string Section = "Auth";

    /// <summary>The <c>iss</c> Identity puts in every token.</summary>
    public string Issuer { get; set; } = "khazana-identity";

    /// <summary>The <c>aud</c> of tokens meant for the API.</summary>
    public string Audience { get; set; } = "khazana-api";

    /// <summary>
    /// Origins clients use to reach the API (the gateway's public address, plus
    /// any others). A DPoP proof names the URL the client called, which is not
    /// the address this service sees behind the gateway.
    /// </summary>
    public IReadOnlyList<string> PublicOrigins { get; set; } = [];

    /// <summary>Identity's discovery document, for its signing keys. Unused in Identity itself.</summary>
    public string? MetadataAddress { get; set; }

    /// <summary>Plain-HTTP metadata, allowed only inside the cluster in development.</summary>
    public bool RequireHttpsMetadata { get; set; } = true;
}

/// <summary>Claim names Khazana tokens carry.</summary>
public static class KhazanaClaims
{
    public const string Subject = "sub";
    public const string Device = "did";
    public const string Confirmation = "cnf";

    public static Guid UserId(this ClaimsPrincipal user) =>
        Guid.Parse(user?.FindFirstValue(Subject) ?? throw new InvalidOperationException("Not signed in."));

    public static Guid DeviceId(this ClaimsPrincipal user) =>
        Guid.Parse(user?.FindFirstValue(Device) ?? throw new InvalidOperationException("Not signed in."));
}

public static class KhazanaAuthentication
{
    /// <summary>
    /// Accepts only DPoP-bound access tokens from Identity: a valid ES256
    /// signature, issuer, audience and lifetime, AND a fresh proof signed by
    /// the key the token is bound to. A bearer token alone is refused, so a
    /// token copied off a device opens nothing.
    /// </summary>
    /// <remarks>
    /// Identity registers its own <see cref="IConfigurationManager{T}"/> first
    /// (its keys are local); every other service fetches Identity's keys from
    /// <see cref="KhazanaAuthOptions.MetadataAddress"/>.
    /// </remarks>
    /// <param name="replayDatabase">
    /// The service's own database, for the shared DPoP replay cache. Null means
    /// an in-process cache, correct only while the service runs one instance.
    /// </param>
    public static IServiceCollection AddKhazanaAuthentication(
        this IServiceCollection services, IConfiguration configuration, string? replayDatabase = null)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        services.Configure<KhazanaAuthOptions>(configuration.GetSection(KhazanaAuthOptions.Section));
        services.AddMemoryCache();
        services.TryAddSingleton(TimeProvider.System);
        if (replayDatabase is not null)
        {
            services.TryAddSingleton(_ => NpgsqlDataSource.Create(replayDatabase));
            services.TryAddSingleton<IDpopReplayCache, PostgresDpopReplayCache>();
            services.AddHostedService<ReplayCacheSchema>();
        }
        services.TryAddSingleton<IDpopReplayCache, MemoryDpopReplayCache>();
        services.TryAddSingleton<DpopProofValidator>();
        services.TryAddSingleton<IConfigurationManager<OpenIdConnectConfiguration>>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<KhazanaAuthOptions>>().Value;
            if (string.IsNullOrWhiteSpace(o.MetadataAddress))
                throw new InvalidOperationException("Auth:MetadataAddress is not set.");
            return new ConfigurationManager<OpenIdConnectConfiguration>(
                o.MetadataAddress, new OpenIdConnectConfigurationRetriever(),
                new HttpDocumentRetriever { RequireHttps = o.RequireHttpsMetadata });
        });

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IServiceProvider>((o, sp) =>
            {
                var auth = sp.GetRequiredService<IOptions<KhazanaAuthOptions>>().Value;
                o.ConfigurationManager = sp.GetRequiredService<IConfigurationManager<OpenIdConnectConfiguration>>();
                o.MapInboundClaims = false;
                o.Challenge = "DPoP";
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = auth.Issuer,
                    ValidAudience = auth.Audience,
                    ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
                    ValidTypes = ["at+jwt"],
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = KhazanaClaims.Subject,
                };
                o.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ReadDpopToken,
                    OnTokenValidated = RequireBoundProof,
                };
            });
        services.AddAuthorization();
        return services;
    }

    /// <summary>The URLs a client may have called to reach this endpoint.</summary>
    public static IReadOnlyCollection<Uri> AcceptedUris(this HttpRequest request, KhazanaAuthOptions options)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(options);
        var path = request.PathBase.Add(request.Path).ToUriComponent();
        var origins = options.PublicOrigins.Count > 0
            ? options.PublicOrigins
            : [$"{request.Scheme}://{request.Host.ToUriComponent()}"];
        return [.. origins.Select(o => new Uri(new Uri(o.TrimEnd('/') + "/"), path.TrimStart('/')))];
    }

    /// <summary><c>Authorization: DPoP &lt;token&gt;</c>. A <c>Bearer</c> token is refused outright.</summary>
    private static Task ReadDpopToken(MessageReceivedContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("DPoP ", StringComparison.Ordinal))
        {
            context.Token = header["DPoP ".Length..].Trim();
        }
        else if (header.Length > 0)
        {
            context.Fail("Only DPoP-bound tokens are accepted.");
        }
        else
        {
            context.NoResult();
        }
        return Task.CompletedTask;
    }

    private static async Task RequireBoundProof(TokenValidatedContext context)
    {
        var request = context.Request;
        // Endpoints parse these as Guids; a token without them must stop here
        // as a 401, never reach an endpoint and throw.
        if (!Guid.TryParse(context.Principal?.FindFirstValue(KhazanaClaims.Subject), out _) ||
            !Guid.TryParse(context.Principal?.FindFirstValue(KhazanaClaims.Device), out _))
        {
            context.Fail("Token has no valid sub or did.");
            return;
        }
        var jkt = BoundKey(context.Principal);
        if (jkt is null)
        {
            context.Fail("Token is not bound to a key.");
            return;
        }

        var proofs = request.Headers["DPoP"];
        if (proofs.Count != 1)
        {
            context.Fail("Exactly one DPoP proof is required.");
            return;
        }

        var services = context.HttpContext.RequestServices;
        var options = services.GetRequiredService<IOptions<KhazanaAuthOptions>>().Value;
        var token = request.Headers.Authorization.ToString()["DPoP ".Length..].Trim();
        try
        {
            var proof = await services.GetRequiredService<DpopProofValidator>()
                .ValidateAsync(proofs[0], request.Method, request.AcceptedUris(options), token).ConfigureAwait(false);
            if (!string.Equals(proof.Jkt, jkt, StringComparison.Ordinal))
                context.Fail("DPoP key does not match the token.");
        }
        catch (DpopValidationException e)
        {
            context.Fail(e.Message);
        }
    }

    private static string? BoundKey(ClaimsPrincipal? principal)
    {
        var cnf = principal?.FindFirstValue(KhazanaClaims.Confirmation);
        if (string.IsNullOrEmpty(cnf)) return null;
        try
        {
            using var doc = JsonDocument.Parse(cnf);
            return doc.RootElement.TryGetProperty("jkt", out var jkt) && jkt.ValueKind == JsonValueKind.String
                ? jkt.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>Creates the replay-cache table at startup (idempotent), before any request arrives.</summary>
internal sealed class ReplayCacheSchema(NpgsqlDataSource dataSource) : Microsoft.Extensions.Hosting.IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken).ConfigureAwait(false);
        await using var cmd = new NpgsqlCommand(PostgresDpopReplayCache.CreateSql, conn);
        await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
