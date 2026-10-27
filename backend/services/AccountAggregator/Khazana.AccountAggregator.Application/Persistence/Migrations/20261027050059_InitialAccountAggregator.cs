using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.AccountAggregator.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialAccountAggregator : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "aa");

            migrationBuilder.CreateTable(
                name: "aa_consents",
                schema: "aa",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    partner = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    consent_handle = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    fi_types = table.Column<string[]>(type: "text[]", nullable: false),
                    frequency = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    data_from = table.Column<DateOnly>(type: "date", nullable: false),
                    data_to = table.Column<DateOnly>(type: "date", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    delivery_key = table.Column<byte[]>(type: "bytea", nullable: false),
                    redirect_url = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    activated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    next_fetch_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    owner_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_aa_consents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "aa_fetch_sagas",
                schema: "aa",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    consent_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    state = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    trigger = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    attempt = table.Column<int>(type: "integer", nullable: false),
                    next_retry_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    error_code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    cost_units = table.Column<int>(type: "integer", nullable: false),
                    session_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    data_from = table.Column<DateOnly>(type: "date", nullable: false),
                    data_to = table.Column<DateOnly>(type: "date", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_aa_fetch_sagas", x => x.id);
                    table.ForeignKey(
                        name: "FK_aa_fetch_sagas_aa_consents_consent_id",
                        column: x => x.consent_id,
                        principalSchema: "aa",
                        principalTable: "aa_consents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "inbox_payloads",
                schema: "aa",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consent_id = table.Column<Guid>(type: "uuid", nullable: false),
                    saga_id = table.Column<Guid>(type: "uuid", nullable: true),
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
                        name: "FK_inbox_payloads_aa_consents_consent_id",
                        column: x => x.consent_id,
                        principalSchema: "aa",
                        principalTable: "aa_consents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_aa_consents_partner_consent_handle",
                schema: "aa",
                table: "aa_consents",
                columns: new[] { "partner", "consent_handle" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_aa_consents_status_next_fetch_at",
                schema: "aa",
                table: "aa_consents",
                columns: new[] { "status", "next_fetch_at" });

            migrationBuilder.CreateIndex(
                name: "IX_aa_consents_user_id",
                schema: "aa",
                table: "aa_consents",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_aa_fetch_sagas_session_id",
                schema: "aa",
                table: "aa_fetch_sagas",
                column: "session_id");

            migrationBuilder.CreateIndex(
                name: "IX_aa_fetch_sagas_user_id",
                schema: "aa",
                table: "aa_fetch_sagas",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_aa_fetch_sagas_one_in_flight",
                schema: "aa",
                table: "aa_fetch_sagas",
                column: "consent_id",
                unique: true,
                filter: "state IN ('Requested', 'Fetching')");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_consent_id",
                schema: "aa",
                table: "inbox_payloads",
                column: "consent_id");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_expires_at",
                schema: "aa",
                table: "inbox_payloads",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "IX_inbox_payloads_user_id_created_at",
                schema: "aa",
                table: "inbox_payloads",
                columns: new[] { "user_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "aa_fetch_sagas",
                schema: "aa");

            migrationBuilder.DropTable(
                name: "inbox_payloads",
                schema: "aa");

            migrationBuilder.DropTable(
                name: "aa_consents",
                schema: "aa");
        }
    }
}
