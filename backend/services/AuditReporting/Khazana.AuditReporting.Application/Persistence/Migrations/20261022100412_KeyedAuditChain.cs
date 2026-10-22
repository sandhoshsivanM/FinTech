using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Khazana.AuditReporting.Application.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class KeyedAuditChain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "hash_version",
                schema: "reporting",
                table: "audit_events",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "audit_head",
                schema: "reporting",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    last_id = table.Column<long>(type: "bigint", nullable: false),
                    last_hash = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_head", x => x.id);
                });

            // In the cloud, migrations run as the schema owner and the service
            // connects as reporting_app, which may only read and append audit
            // records: it can't drop or disable the append-only triggers, or
            // touch the table any other way. Skipped where the role doesn't
            // exist (local and test databases).
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reporting_app') THEN
                        REVOKE ALL ON reporting.audit_events FROM reporting_app;
                        GRANT SELECT, INSERT ON reporting.audit_events TO reporting_app;
                        GRANT SELECT, INSERT, UPDATE ON reporting.audit_head TO reporting_app;
                    END IF;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_head",
                schema: "reporting");

            migrationBuilder.DropColumn(
                name: "hash_version",
                schema: "reporting",
                table: "audit_events");
        }
    }
}
