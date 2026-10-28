using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.Identity.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PhoneOtpChallenges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "phone_otp_challenges",
                schema: "identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    phone_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    phone_enc = table.Column<byte[]>(type: "bytea", nullable: false),
                    code_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    dpop_jkt = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_phone_otp_challenges", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_phone_otp_challenges_created_at",
                schema: "identity",
                table: "phone_otp_challenges",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_phone_otp_challenges_dpop_jkt_created_at",
                schema: "identity",
                table: "phone_otp_challenges",
                columns: new[] { "dpop_jkt", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_phone_otp_challenges_phone_hash_created_at",
                schema: "identity",
                table: "phone_otp_challenges",
                columns: new[] { "phone_hash", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "phone_otp_challenges",
                schema: "identity");
        }
    }
}
