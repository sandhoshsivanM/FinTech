using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Identity.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DeletionSaga : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "deletion_confirmations",
                schema: "identity",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deletion_confirmations", x => new { x.user_id, x.service });
                });

            migrationBuilder.CreateTable(
                name: "deletion_requests",
                schema: "identity",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    execute_after = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deletion_requests", x => x.user_id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deletion_confirmations",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "deletion_requests",
                schema: "identity");
        }
    }
}
