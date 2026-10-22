using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Khazana.MarketData.Api;
using Khazana.MarketData.Domain;
using Khazana.MarketData.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Shouldly;

namespace Khazana.MarketData.Tests;

public class AmfiNavParserTests
{
    private static string Read(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", name));

    // The 2026 eight-column file (Plan and Option split out of the name).
    private static string Fixture => Read("navall_sample.txt");

    [Fact]
    public void Fixture_yields_only_the_valid_rows()
    {
        var quotes = AmfiNavParser.Parse(Fixture);

        // 119551, 119552, 122639, 122640, 120828. Rejected: N.A., zero, no
        // date, exponent notation, non-numeric code, headings, AMC names.
        quotes.Keys.Order(StringComparer.Ordinal).ShouldBe(["119551", "119552", "120828", "122639", "122640"]);
    }

    [Fact]
    public void The_original_six_column_file_still_parses_to_the_same_schemes()
    {
        var current = AmfiNavParser.Parse(Fixture);
        var legacy = AmfiNavParser.Parse(Read("navall_legacy_sample.txt"));
        legacy.Keys.Order(StringComparer.Ordinal).ShouldBe(current.Keys.Order(StringComparer.Ordinal));
        legacy["119551"].Nav.ShouldBe(current["119551"].Nav);
    }

    [Fact]
    public void Plan_and_option_are_joined_back_into_the_name()
    {
        var q = AmfiNavParser.Parse(Fixture);
        q["119551"].SchemeName.ShouldBe("Aditya Birla Sun Life Banking & PSU Debt Fund - Direct Plan - IDCW Option");
        q["122640"].SchemeName.ShouldBe("Parag Parikh Flexi Cap Fund - Regular Plan", "an empty option is left out");
    }

    [Fact]
    public void An_unrecognised_header_yields_nothing_rather_than_misread_columns()
    {
        const string file = "Scheme Code;Fund;Price;When\n119551;Something;123.45;17-Oct-2026";
        AmfiNavParser.Parse(file).ShouldBeEmpty();
    }

    [Fact]
    public void Columns_are_found_by_header_name_not_position()
    {
        const string reordered =
            "Date;Net Asset Value;Scheme Name;ISIN A;ISIN B;Scheme Code\n" +
            "17-Oct-2026;55.5;Reordered Fund;INF1;-;999001";
        var q = AmfiNavParser.Parse(reordered);
        q["999001"].Nav.ShouldBe(55.5m);
        q["999001"].Isin.ShouldBe("INF1");
    }

    [Fact]
    public void Values_are_exact_decimals_with_their_own_dates()
    {
        var q = AmfiNavParser.Parse(Fixture);
        q["119551"].Nav.ShouldBe(123.4567m);
        q["122640"].Nav.ShouldBe(81.5m);
        q["119551"].Date.ShouldBe(new DateOnly(2026, 10, 17));
        q["120828"].Date.ShouldBe(new DateOnly(2026, 10, 16), "a scheme can lag a day behind the rest");
    }

    [Fact]
    public void Isin_is_the_first_real_one_and_dash_means_none()
    {
        var q = AmfiNavParser.Parse(Fixture);
        q["119551"].Isin.ShouldBe("INF209K01157");
        q["119552"].Isin.ShouldBe("INF209K01173", "payout ISIN is '-', so the reinvestment one is used");
        q["122640"].Isin.ShouldBe("INF879O01035");
    }

    [Theory]
    [InlineData("119551;INF1;INF2;Name;N.A.;17-Oct-2026")]
    [InlineData("119551;INF1;INF2;Name;0;17-Oct-2026")]
    [InlineData("119551;INF1;INF2;Name;-5;17-Oct-2026")]
    [InlineData("119551;INF1;INF2;Name;1,234.50;17-Oct-2026")]
    [InlineData("119551;INF1;INF2;Name;1e5;17-Oct-2026")]
    [InlineData("119551;INF1;INF2;Name;12.5;2026-10-17")]
    [InlineData("119551;INF1;INF2;Name;12.5")]
    [InlineData("Scheme Code;ISIN;ISIN;Scheme Name;Net Asset Value;Date")]
    [InlineData("12 345;INF1;INF2;Name;12.5;17-Oct-2026")]
    public void Malformed_rows_are_skipped_not_guessed(string line)
    {
        AmfiNavParser.Parse(line).ShouldBeEmpty();
    }

    [Fact]
    public void An_over_long_line_is_skipped_without_parsing_it()
    {
        var hostile = "119551;INF1;INF2;" + new string('x', AmfiNavParser.MaxLineLength) + ";12.5;17-Oct-2026";
        AmfiNavParser.Parse(hostile + "\n" + "122639;INF879O01027;-;Good;89.1234;17-Oct-2026")
            .Keys.ShouldBe(["122639"]);
    }

    [Fact]
    public void Empty_and_whitespace_input_parse_to_nothing()
    {
        AmfiNavParser.Parse("").ShouldBeEmpty();
        AmfiNavParser.Parse("\r\n\r\n   \n").ShouldBeEmpty();
    }
}

public class NavDayFileTests
{
    private static readonly NavQuote A = new("2", "Beta", 20.5m, "INF2", new DateOnly(2026, 10, 17));
    private static readonly NavQuote B = new("1", "Alpha", 10.25m, null, new DateOnly(2026, 10, 16));

    [Fact]
    public void Same_quotes_in_any_order_give_the_same_bytes_and_hash()
    {
        var one = NavDayFile.Build([A, B]);
        var two = NavDayFile.Build([B, A]);
        one.Sha256.ShouldBe(two.Sha256);
        one.Gzip.ShouldBe(two.Gzip);
    }

    [Fact]
    public void Date_is_the_newest_nav_and_the_gzip_round_trips()
    {
        var file = NavDayFile.Build([A, B]);
        file.Date.ShouldBe(new DateOnly(2026, 10, 17));
        file.RowCount.ShouldBe(2);

        using var gzip = new GZipStream(new MemoryStream(file.Gzip), CompressionMode.Decompress);
        using var doc = JsonDocument.Parse(gzip);
        var rows = doc.RootElement.EnumerateArray().ToList();
        rows[0].GetProperty("c").GetString().ShouldBe("1", "sorted by scheme code");
        rows[0].TryGetProperty("i", out _).ShouldBeFalse("null ISINs are omitted");
        rows[1].GetProperty("v").GetDecimal().ShouldBe(20.5m);
    }

    [Fact]
    public void An_empty_day_is_refused()
    {
        Should.Throw<InvalidOperationException>(() => NavDayFile.Build([]));
    }
}

public class NavIngestSchedulerTests
{
    private static DateTimeOffset Ist(int y, int m, int d, int h, int min) =>
        new(y, m, d, h, min, 0, TimeSpan.FromHours(5.5));

    [Fact]
    public void Before_2330_IST_runs_the_same_evening()
    {
        NavIngestScheduler.NextRunAfter(Ist(2026, 10, 22, 9, 0)).ShouldBe(Ist(2026, 10, 22, 23, 30));
    }

    [Fact]
    public void At_or_after_2330_IST_runs_the_next_evening()
    {
        NavIngestScheduler.NextRunAfter(Ist(2026, 10, 22, 23, 30)).ShouldBe(Ist(2026, 10, 23, 23, 30));
        NavIngestScheduler.NextRunAfter(Ist(2026, 10, 22, 23, 45)).ShouldBe(Ist(2026, 10, 23, 23, 30));
    }

    [Fact]
    public void A_UTC_clock_lands_on_the_IST_evening()
    {
        // 18:00 UTC is 23:30 IST: exactly the run time, so the next one is tomorrow.
        var now = new DateTimeOffset(2026, 10, 22, 18, 0, 0, TimeSpan.Zero);
        NavIngestScheduler.NextRunAfter(now).ShouldBe(Ist(2026, 10, 23, 23, 30));
    }
}

public class NavSourceTests
{
    [Fact]
    public async Task Download_over_the_cap_is_refused_even_without_a_content_length()
    {
        using var body = new MemoryStream(new byte[2_000]);
        await Should.ThrowAsync<InvalidDataException>(() =>
            AmfiNavSource.ReadCappedAsync(body, maxBytes: 1_000, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Download_within_the_cap_is_read_as_utf8()
    {
        using var body = new MemoryStream(Encoding.UTF8.GetBytes("119551;₹"));
        (await AmfiNavSource.ReadCappedAsync(body, 1_000, TestContext.Current.CancellationToken)).ShouldBe("119551;₹");
    }

    [Fact]
    public void Fixture_data_is_refused_in_Production()
    {
        var ex = Should.Throw<InvalidOperationException>(() => Register("Fixture", Environments.Production));
        ex.Message.ShouldContain("not allowed in Production");
    }

    [Fact]
    public void Unknown_source_is_refused_at_startup()
    {
        Should.Throw<InvalidOperationException>(() => Register("Guess", Environments.Development));
    }

    [Fact]
    public void Fixture_is_allowed_in_Development()
    {
        Should.NotThrow(() => Register("Fixture", Environments.Development));
    }

    private static void Register(string nav, string environment)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Providers:Nav"] = nav })
            .Build();
        new ServiceCollection().AddNavSource(config, new FakeEnvironment(environment));
    }

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
