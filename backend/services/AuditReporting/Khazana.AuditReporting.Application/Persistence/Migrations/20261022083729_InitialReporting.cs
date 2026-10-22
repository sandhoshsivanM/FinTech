using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Khazana.AuditReporting.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialReporting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "reporting");

            migrationBuilder.CreateTable(
                name: "audit_events",
                schema: "reporting",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    actor = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    target = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    reason = table.Column<string>(type: "character varying(280)", maxLength: 280, nullable: true),
                    previous_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    hash = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "deleted_users",
                schema: "reporting",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deleted_users", x => x.user_id);
                });

            migrationBuilder.CreateTable(
                name: "signin_events",
                schema: "reporting",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_id = table.Column<Guid>(type: "uuid", nullable: false),
                    platform = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_signin_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "user_directory",
                schema: "reporting",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    registered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_active_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    platforms = table.Column<string[]>(type: "text[]", nullable: false),
                    device_count = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_directory", x => x.user_id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_signin_events_at",
                schema: "reporting",
                table: "signin_events",
                column: "at");

            migrationBuilder.CreateIndex(
                name: "IX_signin_events_user_id_at",
                schema: "reporting",
                table: "signin_events",
                columns: new[] { "user_id", "at" });

            migrationBuilder.CreateIndex(
                name: "IX_user_directory_registered_at",
                schema: "reporting",
                table: "user_directory",
                column: "registered_at");

            // Append-only at the database level: not even the service's own
            // login can change or remove an audit record. (The hash chain then
            // catches anything done around this, e.g. by a superuser.)
            migrationBuilder.Sql("""
                CREATE FUNCTION reporting.audit_events_append_only() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'reporting.audit_events is append-only';
                END $$;
                CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON reporting.audit_events
                    FOR EACH ROW EXECUTE FUNCTION reporting.audit_events_append_only();
                CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON reporting.audit_events
                    FOR EACH STATEMENT EXECUTE FUNCTION reporting.audit_events_append_only();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS audit_events_no_truncate ON reporting.audit_events;
                DROP TRIGGER IF EXISTS audit_events_no_change ON reporting.audit_events;
                DROP FUNCTION IF EXISTS reporting.audit_events_append_only();
                """);

            migrationBuilder.DropTable(
                name: "audit_events",
                schema: "reporting");

            migrationBuilder.DropTable(
                name: "deleted_users",
                schema: "reporting");

            migrationBuilder.DropTable(
                name: "signin_events",
                schema: "reporting");

            migrationBuilder.DropTable(
                name: "user_directory",
                schema: "reporting");
        }
    }
}
