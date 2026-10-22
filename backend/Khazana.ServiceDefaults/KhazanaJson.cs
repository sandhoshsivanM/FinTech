using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;

namespace Microsoft.Extensions.Hosting;

public static class KhazanaJson
{
    /// <summary>
    /// The API's JSON rules, the same in every service: snake_case names
    /// (OAuth's convention, used everywhere so clients have one rule), and an
    /// unknown field fails the request — a client bug or a probe, either way loud.
    /// </summary>
    public static IServiceCollection AddKhazanaJson(this IServiceCollection services) =>
        services.ConfigureHttpJsonOptions(o =>
        {
            o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
            o.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
            // A null or missing required field is a 400, not a NullReferenceException later.
            o.SerializerOptions.RespectNullableAnnotations = true;
            o.SerializerOptions.RespectRequiredConstructorParameters = true;
        });
}
