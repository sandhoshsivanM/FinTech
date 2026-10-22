using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Catalog.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "catalog");

            migrationBuilder.CreateTable(
                name: "catalog_versions",
                schema: "catalog",
                columns: table => new
                {
                    version = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    content_checksum = table.Column<byte[]>(type: "bytea", nullable: false),
                    key_id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    signature = table.Column<byte[]>(type: "bytea", nullable: false),
                    payload = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_catalog_versions", x => x.version);
                });

            migrationBuilder.CreateTable(
                name: "offers",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    doc = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_offers", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "parser_templates",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    doc = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_parser_templates", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "catalog_versions",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "offers",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "parser_templates",
                schema: "catalog");
        }
    }
}
