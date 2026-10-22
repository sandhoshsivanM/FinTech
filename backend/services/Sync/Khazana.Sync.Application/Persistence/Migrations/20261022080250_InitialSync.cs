using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Sync.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "sync");

            migrationBuilder.CreateTable(
                name: "revoked_devices",
                schema: "sync",
                columns: table => new
                {
                    device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revoked_devices", x => x.device_id);
                });

            migrationBuilder.CreateTable(
                name: "sync_records",
                schema: "sync",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    record_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    collection = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    seq = table.Column<long>(type: "bigint", nullable: false),
                    client_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted = table.Column<bool>(type: "boolean", nullable: false),
                    ciphertext = table.Column<byte[]>(type: "bytea", nullable: false),
                    key_version = table.Column<int>(type: "integer", nullable: false),
                    from_device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    stored_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_records", x => new { x.user_id, x.record_id });
                });

            migrationBuilder.CreateTable(
                name: "sync_users",
                schema: "sync",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    last_seq = table.Column<long>(type: "bigint", nullable: false),
                    purged_through_seq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_users", x => x.user_id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_revoked_devices_user_id",
                schema: "sync",
                table: "revoked_devices",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_sync_records_stored_at",
                schema: "sync",
                table: "sync_records",
                column: "stored_at",
                filter: "deleted");

            migrationBuilder.CreateIndex(
                name: "IX_sync_records_user_id_seq",
                schema: "sync",
                table: "sync_records",
                columns: new[] { "user_id", "seq" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "revoked_devices",
                schema: "sync");

            migrationBuilder.DropTable(
                name: "sync_records",
                schema: "sync");

            migrationBuilder.DropTable(
                name: "sync_users",
                schema: "sync");
        }
    }
}
