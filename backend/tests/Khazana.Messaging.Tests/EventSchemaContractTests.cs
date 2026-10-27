using Shouldly;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Khazana.Messaging.Contracts;
using Wolverine.Attributes;

namespace Khazana.Messaging.Tests;

/// <summary>
/// Every event contract has a JSON Schema in contracts/events/, and the two
/// agree. A changed record (renamed, retyped, added or removed field) or a
/// missing/stale schema fails here, so a producer cannot change the wire shape
/// without the contract file, which consumers (and the apps) read, changing too.
/// </summary>
public class EventSchemaContractTests
{
    private static readonly string SchemaDir = FindSchemaDir();

    private static string FindSchemaDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "contracts", "events")))
            dir = dir.Parent;
        return dir is null
            ? throw new DirectoryNotFoundException("contracts/events not found above " + AppContext.BaseDirectory)
            : Path.Combine(dir.FullName, "contracts", "events");
    }

    private static Dictionary<string, Type> Contracts() =>
        typeof(PricesPublishedV1).Assembly.GetTypes()
            .Where(t => t.Namespace == "Khazana.Messaging.Contracts")
            .Select(t => (Type: t, Attr: t.GetCustomAttribute<MessageIdentityAttribute>()))
            .Where(x => x.Attr is not null)
            .ToDictionary(x => x.Type.GetCustomAttributesData()
                .First(d => d.AttributeType == typeof(MessageIdentityAttribute))
                .ConstructorArguments[0].Value!.ToString()!, x => x.Type);

    private static string SchemaType(Type t)
    {
        t = Nullable.GetUnderlyingType(t) ?? t;
        return t == typeof(string) || t == typeof(Guid) || t == typeof(DateTimeOffset) || t == typeof(DateOnly)
            ? "string"
            : t == typeof(int) || t == typeof(long) ? "integer"
            : throw new NotSupportedException($"Unmapped event field type {t}; extend the schema mapping.");
    }

    private static string? SchemaFormat(Type t) =>
        t == typeof(Guid) ? "uuid" : t == typeof(DateTimeOffset) ? "date-time" : t == typeof(DateOnly) ? "date" : null;

    private static string Camel(string s) => char.ToLowerInvariant(s[0]) + s[1..];

    [Fact]
    public void Every_event_has_a_schema_and_every_schema_has_an_event()
    {
        var identities = Contracts().Keys.Order().ToArray();
        var files = Directory.GetFiles(SchemaDir, "*.schema.json")
            .Select(f => Path.GetFileName(f).Replace(".schema.json", "", StringComparison.Ordinal))
            .Order().ToArray();
        files.ShouldBe(identities);
        identities.ShouldNotBeEmpty();
    }

    [Fact]
    public void Schemas_match_the_records_field_for_field()
    {
        foreach (var (identity, type) in Contracts())
        {
            var schema = JsonNode.Parse(File.ReadAllText(Path.Combine(SchemaDir, identity + ".schema.json")))!.AsObject();
            schema["additionalProperties"]!.GetValue<bool>().ShouldBeFalse(identity);
            schema["title"]!.GetValue<string>().ShouldBe(type.Name, identity);

            var props = schema["properties"]!.AsObject();
            var fields = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.Name != "EqualityContract").ToArray();
            props.Select(p => p.Key).Order().ShouldBe(fields.Select(f => Camel(f.Name)).Order(), identity);
            schema["required"]!.AsArray().Select(n => n!.GetValue<string>()).Order()
                .ShouldBe(fields.Select(f => Camel(f.Name)).Order(), identity);

            foreach (var f in fields)
            {
                var p = props[Camel(f.Name)]!.AsObject();
                p["type"]!.GetValue<string>().ShouldBe(SchemaType(f.PropertyType), $"{identity}.{f.Name}");
                p["format"]?.GetValue<string>().ShouldBe(SchemaFormat(f.PropertyType), $"{identity}.{f.Name}");
            }
        }
    }

    [Fact]
    public void Serialised_events_carry_exactly_the_schema_fields()
    {
        foreach (var (identity, type) in Contracts())
        {
            var sample = Sample(type);
            var json = JsonNode.Parse(JsonSerializer.Serialize(sample, type, JsonSerializerOptions.Web))!.AsObject();
            var schema = JsonNode.Parse(File.ReadAllText(Path.Combine(SchemaDir, identity + ".schema.json")))!.AsObject();
            json.Select(p => p.Key).Order()
                .ShouldBe(schema["properties"]!.AsObject().Select(p => p.Key).Order(), identity);
        }
    }

    private static object Sample(Type type)
    {
        var ctor = type.GetConstructors().OrderByDescending(c => c.GetParameters().Length).First();
        var args = ctor.GetParameters().Select(p => p.ParameterType switch
        {
            var t when t == typeof(Guid) => (object)Guid.NewGuid(),
            var t when t == typeof(DateTimeOffset) => DateTimeOffset.UnixEpoch,
            var t when t == typeof(DateOnly) => new DateOnly(2026, 1, 2),
            var t when t == typeof(string) => "x",
            var t when t == typeof(int) => 1,
            var t when t == typeof(long) => 1L,
            var t => throw new NotSupportedException(t.ToString()),
        }).ToArray();
        return ctor.Invoke(args);
    }
}
