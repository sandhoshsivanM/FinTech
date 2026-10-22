using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Identity.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Sessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "sessions",
                schema: "identity",
                columns: table => new
                {
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sessions", x => x.family_id);
                    table.ForeignKey(
                        name: "FK_sessions_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "identity",
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_sessions_device_id",
                schema: "identity",
                table: "sessions",
                column: "device_id");

            migrationBuilder.CreateIndex(
                name: "IX_sessions_user_id",
                schema: "identity",
                table: "sessions",
                column: "user_id");

            // Existing token families become sessions: live if any of their
            // tokens is unrevoked, revoked otherwise.
            migrationBuilder.Sql("""
                INSERT INTO identity.sessions (family_id, user_id, device_id, created_at, revoked_at)
                SELECT family_id, min(user_id::text)::uuid, min(device_id::text)::uuid, min(created_at),
                       CASE WHEN bool_or(revoked_at IS NULL) THEN NULL ELSE max(revoked_at) END
                FROM identity.refresh_tokens
                GROUP BY family_id
                ON CONFLICT (family_id) DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "sessions",
                schema: "identity");
        }
    }
}
