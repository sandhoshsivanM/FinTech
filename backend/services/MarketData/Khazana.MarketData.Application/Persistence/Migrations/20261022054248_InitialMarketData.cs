using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.MarketData.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialMarketData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "market");

            migrationBuilder.CreateTable(
                name: "nav_files",
                schema: "market",
                columns: table => new
                {
                    nav_date = table.Column<DateOnly>(type: "date", nullable: false),
                    row_count = table.Column<int>(type: "integer", nullable: false),
                    sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    gzip = table.Column<byte[]>(type: "bytea", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_nav_files", x => x.nav_date);
                });

            migrationBuilder.CreateTable(
                name: "nav_quotes",
                schema: "market",
                columns: table => new
                {
                    scheme_code = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    nav_date = table.Column<DateOnly>(type: "date", nullable: false),
                    nav = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    isin = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    scheme_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_nav_quotes", x => new { x.scheme_code, x.nav_date });
                });

            migrationBuilder.CreateIndex(
                name: "IX_nav_quotes_nav_date",
                schema: "market",
                table: "nav_quotes",
                column: "nav_date");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "nav_files",
                schema: "market");

            migrationBuilder.DropTable(
                name: "nav_quotes",
                schema: "market");
        }
    }
}
