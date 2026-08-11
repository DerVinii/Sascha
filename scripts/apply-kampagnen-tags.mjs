/**
 * Additive Migration: Tags für Kampagnen-Ordner.
 *   - Tabelle lead_list_tags (Name + Farbe, je Organisation)
 *   - lead_lists.tag_id → n:1-Zuordnung, ON DELETE SET NULL
 *
 * Idempotent. Aufruf: node scripts/apply-kampagnen-tags.mjs
 * (drizzle-kit push ist in diesem Projekt kaputt → DDL direkt anwenden.)
 */
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
    CREATE TABLE IF NOT EXISTS lead_list_tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      color text NOT NULL DEFAULT 'slate',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS lead_list_tags_org_idx ON lead_list_tags(org_id);`,
  );
  // Ein Tag-Name je Org, Groß-/Kleinschreibung egal: wer "Schulen" tippt, obwohl
  // "schulen" existiert, soll den bestehenden Tag treffen statt einen zweiten
  // anzulegen.
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS lead_list_tags_org_name_unique
       ON lead_list_tags(org_id, lower(name));`,
  );

  await sql.unsafe(`
    ALTER TABLE lead_lists
      ADD COLUMN IF NOT EXISTS tag_id uuid
      REFERENCES lead_list_tags(id) ON DELETE SET NULL;
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS lead_lists_tag_idx ON lead_lists(tag_id);`,
  );

  const [{ c: tagCount }] = await sql`SELECT count(*)::int AS c FROM lead_list_tags`;
  const [{ c: taggedLists }] =
    await sql`SELECT count(*)::int AS c FROM lead_lists WHERE tag_id IS NOT NULL`;
  console.log(
    `OK: lead_list_tags bereit — ${tagCount} Tag(s), ${taggedLists} markierte Kampagne(n).`,
  );
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
