using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Khazana.Identity.Application.Persistence;

/// <summary>
/// Used only by <c>dotnet ef migrations add</c>. The connection string is never
/// opened while generating a migration, so a placeholder is enough.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql("Host=localhost;Database=identity_design")
            .Options);
}
