using System.Globalization;
using Khazana.MarketData.Application.Ingest;
using Khazana.MarketData.Application.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using Wolverine;

namespace Khazana.MarketData.Api;

public static class NavEndpoints
{
    public static WebApplication MapNavEndpoints(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var nav = app.MapGroup("/v1/market/nav");

        nav.MapGet("/latest", async (MarketDataDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var file = await db.NavFiles.AsNoTracking()
                .OrderByDescending(f => f.NavDate).FirstOrDefaultAsync(ct);
            return Serve(file, http, immutable: false);
        });

        nav.MapGet("/{date}", async (string date, MarketDataDbContext db, HttpContext http, CancellationToken ct) =>
        {
            // Parsed by hand with one exact format, so "2026-1-5" or a time
            // component is a clean 400, never a surprise interpretation.
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var day))
            {
                return Results.Problem("Date must be yyyy-MM-dd.", statusCode: StatusCodes.Status400BadRequest);
            }
            var file = await db.NavFiles.AsNoTracking().FirstOrDefaultAsync(f => f.NavDate == day, ct);
            return Serve(file, http, immutable: true);
        });

        // Manual trigger for local development only. Mapped nowhere else, and
        // the gateway has no route to /internal at all.
        if (app.Environment.IsDevelopment())
        {
            app.MapPost("/internal/market/nav/ingest", async (IMessageBus bus) =>
            {
                await bus.InvokeAsync(new IngestNav());
                return Results.Accepted();
            });
        }

        return app;
    }

    /// <summary>
    /// Sends the stored gzip bytes untouched. The ETag is the content hash, so a
    /// device that already has today's file gets a 304 and downloads nothing.
    /// A dated file never changes once published, so it is cacheable forever.
    /// </summary>
    private static IResult Serve(NavFileRow? file, HttpContext http, bool immutable)
    {
        if (file is null) return Results.NotFound();

        var etag = new EntityTagHeaderValue($"\"{file.Sha256}\"");
        http.Response.Headers.ETag = etag.ToString();
        http.Response.Headers.CacheControl = immutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300";

        var ifNoneMatch = http.Request.GetTypedHeaders().IfNoneMatch;
        if (ifNoneMatch.Any(t => t.Compare(etag, useStrongComparison: true)))
        {
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        http.Response.Headers.ContentEncoding = "gzip";
        http.Response.Headers["X-Khazana-Nav-Date"] = file.NavDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return Results.Bytes(file.Gzip, "application/json");
    }
}
