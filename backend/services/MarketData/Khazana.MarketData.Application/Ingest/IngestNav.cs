using Khazana.MarketData.Application.Persistence;
using Khazana.MarketData.Domain;
using Khazana.Messaging.Contracts;
using Khazana.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Wolverine;

namespace Khazana.MarketData.Application.Ingest;

/// <summary>Fetch, store and publish today's NAVs.</summary>
public sealed record IngestNav;

/// <summary>
/// Handles <see cref="IngestNav"/>. Wolverine runs this inside one database
/// transaction (AutoApplyTransactions + the EF Core integration): the upserted
/// rows, the day file and the outgoing <see cref="PricesPublishedV1"/> commit
/// together or not at all.
/// </summary>
public static class IngestNavHandler
{
    // One statement for the whole day. unnest() turns five parallel arrays into
    // rows, so 15,000 NAVs cost one round trip and five parameters — not 15,000
    // INSERTs, and not one giant VALUES list that would hit Postgres's 65,535
    // parameter limit at about 13,000 rows.
    private const string UpsertSql = """
        INSERT INTO market.nav_quotes (scheme_code, nav_date, nav, isin, scheme_name)
        SELECT * FROM unnest(@codes, @dates, @navs, @isins, @names)
        ON CONFLICT (scheme_code, nav_date) DO UPDATE
            SET nav = EXCLUDED.nav, isin = EXCLUDED.isin, scheme_name = EXCLUDED.scheme_name
        """;

    public static async Task<OutgoingMessages> Handle(
        IngestNav command,
        INavSource source,
        MarketDataDbContext db,
        IClock clock,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clock);

        var outgoing = new OutgoingMessages();
        var raw = await source.FetchAllAsync(cancellationToken).ConfigureAwait(false);
        var quotes = AmfiNavParser.Parse(raw).Values.ToList();

        // An empty or unreadable file must never be published as "today's
        // prices": fail, keep yesterday's file, and let the retry policy or the
        // next scheduled run try again.
        if (quotes.Count == 0)
        {
            throw new InvalidOperationException("The NAV source returned no usable rows.");
        }

        // The atomicity promise above depends on Wolverine having opened the
        // transaction before this handler runs. If configuration ever changes
        // so it hasn't, fail loudly rather than upsert outside it and risk
        // "rows saved, event lost".
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException(
                "IngestNav must run inside Wolverine's transaction (AutoApplyTransactions + EF Core integration).");
        }

        await db.Database.ExecuteSqlRawAsync(UpsertSql,
            [
                Array("codes", NpgsqlDbType.Text, quotes.Select(q => q.SchemeCode).ToArray()),
                Array("dates", NpgsqlDbType.Date, quotes.Select(q => q.Date).ToArray()),
                Array("navs", NpgsqlDbType.Numeric, quotes.Select(q => q.Nav).ToArray()),
                Array("isins", NpgsqlDbType.Text, quotes.Select(q => q.Isin).ToArray()),
                Array("names", NpgsqlDbType.Text, quotes.Select(q => q.SchemeName).ToArray()),
            ],
            cancellationToken).ConfigureAwait(false);

        var file = NavDayFile.Build(quotes);
        var existing = await db.NavFiles.FindAsync([file.Date], cancellationToken).ConfigureAwait(false);

        // Same bytes as last time: the rows are refreshed (harmless), but there
        // is no new file to announce, so consumers aren't woken for nothing.
        if (existing?.Sha256 == file.Sha256) return outgoing;

        if (existing is null)
        {
            db.NavFiles.Add(new NavFileRow
            {
                NavDate = file.Date,
                RowCount = file.RowCount,
                Sha256 = file.Sha256,
                Gzip = file.Gzip,
                CreatedAt = clock.UtcNow,
            });
        }
        else
        {
            existing.RowCount = file.RowCount;
            existing.Sha256 = file.Sha256;
            existing.Gzip = file.Gzip;
            existing.CreatedAt = clock.UtcNow;
        }

        outgoing.Add(new PricesPublishedV1(file.Date, "nav", file.RowCount, file.Sha256));
        return outgoing;
    }

    private static NpgsqlParameter Array<T>(string name, NpgsqlDbType elementType, T[] values) =>
        new(name, NpgsqlDbType.Array | elementType) { Value = values };
}
