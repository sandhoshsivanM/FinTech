using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Devices.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialDevices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "devices");

            migrationBuilder.CreateTable(
                name: "devices",
                schema: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    platform = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    app_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    public_key = table.Column<byte[]>(type: "bytea", nullable: false),
                    dpop_jkt = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_devices", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "key_checks",
                schema: "devices",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    key_version = table.Column<int>(type: "integer", nullable: false),
                    check_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_key_checks", x => new { x.user_id, x.key_version });
                });

            migrationBuilder.CreateTable(
                name: "key_envelopes",
                schema: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_id = table.Column<Guid>(type: "uuid", nullable: true),
                    wrapped_dek = table.Column<byte[]>(type: "bytea", nullable: false),
                    alg = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    key_version = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_key_envelopes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "pairing_sessions",
                schema: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    new_device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pairing_sessions", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_devices_user_id",
                schema: "devices",
                table: "devices",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_key_envelopes_user_id_device_id_key_version",
                schema: "devices",
                table: "key_envelopes",
                columns: new[] { "user_id", "device_id", "key_version" },
                unique: true,
                filter: "device_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_key_envelopes_recovery",
                schema: "devices",
                table: "key_envelopes",
                columns: new[] { "user_id", "key_version" },
                unique: true,
                filter: "device_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_pairing_sessions_user_id",
                schema: "devices",
                table: "pairing_sessions",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "devices",
                schema: "devices");

            migrationBuilder.DropTable(
                name: "key_checks",
                schema: "devices");

            migrationBuilder.DropTable(
                name: "key_envelopes",
                schema: "devices");

            migrationBuilder.DropTable(
                name: "pairing_sessions",
                schema: "devices");
        }
    }
}
