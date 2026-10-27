using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Credit.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCredit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "credit");

            migrationBuilder.CreateTable(
                name: "credit_pulls",
                schema: "credit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    consent_text_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    purpose = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    error_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_credit_pulls", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "inbox_payloads",
                schema: "credit",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pull_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    alg = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    sealed_payload = table.Column<byte[]>(type: "bytea", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inbox_payloads", x => x.id);
                    table.ForeignKey(
                        name: "FK_inbox_payloads_credit_pulls_pull_id",
                        column: x => x.pull_id,
                        principalSchema: "credit",
                        principalTable: "credit_pulls",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_credit_pulls_user_id_requested_at",
                schema: "credit",
                table: "credit_pulls",
                columns: new[] { "user_id", "requested_at" });

            migrationBuilder.CreateIndex(
                name: "ix_credit_pulls_one_in_progress",
                schema: "credit",
                table: "credit_pulls",
                column: "user_id",
                unique: true,
                filter: "status = 'InProgress'");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_expires_at",
                schema: "credit",
                table: "inbox_payloads",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_pull_id",
                schema: "credit",
                table: "inbox_payloads",
                column: "pull_id");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_user_id_created_at",
                schema: "credit",
                table: "inbox_payloads",
                columns: new[] { "user_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbox_payloads",
                schema: "credit");

            migrationBuilder.DropTable(
                name: "credit_pulls",
                schema: "credit");
        }
    }
}
