// Idempotente Migration: Tabelle campaign_templates (Kampagnen-Texte unter
// einem Namen speichern und in anderen Ordnern wiederverwenden).
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
    CREATE TABLE IF NOT EXISTS campaign_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS campaign_templates_org_idx ON campaign_templates(org_id);`,
  );
  // Ziel des ON-CONFLICT-Upserts beim Speichern: gleicher Name = Vorlage
  // aktualisieren statt doppelt anlegen.
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE campaign_templates
        ADD CONSTRAINT campaign_templates_org_name_unique UNIQUE (org_id, name);
    EXCEPTION WHEN duplicate_table THEN NULL;
              WHEN duplicate_object THEN NULL;
    END $$;
  `);

  const rows = await sql`SELECT count(*)::int AS c FROM campaign_templates`;
  console.log("campaign_templates bereit — vorhandene Vorlagen:", rows[0].c);
  console.log("OK");
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
