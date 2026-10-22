using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Notification.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TokenUniqueAndRevoked : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "token",
                schema: "notification",
                table: "push_tokens",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(4096)",
                oldMaxLength: 4096);

            migrationBuilder.CreateTable(
                name: "revoked_devices",
                schema: "notification",
                columns: table => new
                {
                    device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revoked_devices", x => x.device_id);
                });

            // Earlier versions allowed one token under several devices: keep the newest.
            migrationBuilder.Sql("""
                DELETE FROM notification.push_tokens a USING notification.push_tokens b
                WHERE a.token = b.token AND a.updated_at < b.updated_at;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_push_tokens_token",
                schema: "notification",
                table: "push_tokens",
                column: "token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_revoked_devices_user_id",
                schema: "notification",
                table: "revoked_devices",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "revoked_devices",
                schema: "notification");

            migrationBuilder.DropIndex(
                name: "IX_push_tokens_token",
                schema: "notification",
                table: "push_tokens");

            migrationBuilder.AlterColumn<string>(
                name: "token",
                schema: "notification",
                table: "push_tokens",
                type: "character varying(4096)",
                maxLength: 4096,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(2048)",
                oldMaxLength: 2048);
        }
    }
}
