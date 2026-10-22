using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.MarketData.Application.Persistence;

/// <summary>
/// Used only by <c>dotnet ef migrations add</c>, which needs a DbContext without
/// starting the app. The connection string is never opened while generating a
/// migration, so a placeholder is enough — no real credentials in the repo.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<MarketDataDbContext>
{
    public MarketDataDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<MarketDataDbContext>()
            .UseNpgsql("Host=localhost;Database=marketdata_design")
            .Options);
}
