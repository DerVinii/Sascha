// Idempotente Migration: lead_lists + lead_list_id (cascade) an contacts/companies,
// plus Backfill bestehender gescrapter Leads in Ordner nach Nische+Stadt.
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt");
  process.exit(1);
}
const sql = postgres(url, { prepare: false });

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS lead_lists (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS lead_lists_org_idx ON lead_lists(org_id);`,
  );
  await sql.unsafe(
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_list_id uuid REFERENCES lead_lists(id) ON DELETE CASCADE;`,
  );
  await sql.unsafe(
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_list_id uuid REFERENCES lead_lists(id) ON DELETE CASCADE;`,
  );
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS contacts_lead_list_idx ON contacts(lead_list_id);`,
  );
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS companies_lead_list_idx ON companies(lead_list_id);`,
  );

  // Backfill: Ordnernamen aus Nische+Stadt der bestehenden gescrapten Firmen.
  const nameExpr = `COALESCE(NULLIF(trim(COALESCE(custom_fields->>'niche','') || ' ' || COALESCE(custom_fields->>'city','')), ''), 'Importierte Leads')`;

  await sql.unsafe(`
    INSERT INTO lead_lists (org_id, name)
    SELECT DISTINCT c.org_id, ${nameExpr} AS name
    FROM companies c
    WHERE c.lead_list_id IS NULL AND (c.custom_fields ? 'googlePlaceId')
      AND NOT EXISTS (
        SELECT 1 FROM lead_lists l
        WHERE l.org_id = c.org_id AND l.name = ${nameExpr}
      );
  `);

  await sql.unsafe(`
    UPDATE companies c SET lead_list_id = l.id
    FROM lead_lists l
    WHERE c.lead_list_id IS NULL AND (c.custom_fields ? 'googlePlaceId')
      AND l.org_id = c.org_id
      AND l.name = ${nameExpr};
  `);

  await sql.unsafe(`
    UPDATE contacts ct SET lead_list_id = c.lead_list_id
    FROM companies c
    WHERE ct.company_id = c.id
      AND ct.lead_list_id IS NULL
      AND ct.source = 'Google Maps'
      AND c.lead_list_id IS NOT NULL;
  `);

  const lists = await sql`SELECT name, count(*) FILTER (WHERE TRUE) AS n
    FROM lead_lists GROUP BY name ORDER BY name`;
  const assigned = await sql`SELECT count(*)::int AS c FROM contacts WHERE lead_list_id IS NOT NULL`;
  console.log("Listen:", lists.map((r) => r.name).join(" | ") || "(keine)");
  console.log("Zugeordnete Kontakte:", assigned[0].c);
  console.log("OK");
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
