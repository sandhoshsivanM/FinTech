using System.Text;
using Khazana.MarketData.Application;

namespace Khazana.MarketData.Infrastructure;

public sealed class NavSourceOptions
{
    public const string Section = "Providers";

    /// <summary><c>Amfi</c> (real, free) or <c>Fixture</c> (development and tests).</summary>
    public string Nav { get; set; } = "Amfi";

    /// <summary>Path to the fixture file when <see cref="Nav"/> is <c>Fixture</c>.</summary>
    public string? NavFixturePath { get; set; }

    /// <summary>
    /// AMFI moved the file to its portal in 2026; the old www address now
    /// answers with a redirect (still followed, but one round trip slower).
    /// </summary>
    public Uri AmfiUrl { get; set; } = new("https://portal.amfiindia.com/spages/NAVAll.txt");
}

/// <summary>
/// The real source: AMFI's free daily file of every scheme in India.
/// </summary>
/// <remarks>
/// The response comes from the internet and is treated as hostile. The body is
/// read through a hard size cap, so a misbehaving server can't exhaust memory;
/// the timeout and retries come from the standard resilience handler.
/// </remarks>
public sealed class AmfiNavSource(HttpClient http, NavSourceOptions options) : INavSource
{
    /// <summary>The real file is ~2 MB. Ten times that is not a NAV file.</summary>
    public const long MaxBytes = 20 * 1024 * 1024;

    public async Task<string> FetchAllAsync(CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(options.AmfiUrl, HttpCompletionOption.ResponseHeadersRead,
            cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        if (response.Content.Headers.ContentLength > MaxBytes)
        {
            throw new InvalidDataException($"AMFI response is larger than {MaxBytes} bytes.");
        }

        await using var body = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await ReadCappedAsync(body, MaxBytes, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Reads a stream as UTF-8, throwing as soon as it exceeds <paramref name="maxBytes"/>.
    /// Content-Length can lie or be absent, so the cap is enforced on the bytes read.
    /// </summary>
    public static async Task<string> ReadCappedAsync(Stream body, long maxBytes, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(body);
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await body.ReadAsync(chunk, cancellationToken).ConfigureAwait(false)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw new InvalidDataException($"Response exceeded {maxBytes} bytes.");
            }
            buffer.Write(chunk, 0, read);
        }
        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }
}

/// <summary>A fixed sample file, so development and tests never hit AMFI.</summary>
public sealed class FixtureNavSource(NavSourceOptions options) : INavSource
{
    public Task<string> FetchAllAsync(CancellationToken cancellationToken) =>
        File.ReadAllTextAsync(
            options.NavFixturePath ?? throw new InvalidOperationException(
                "Providers:NavFixturePath must be set when Providers:Nav is Fixture."),
            cancellationToken);
}
