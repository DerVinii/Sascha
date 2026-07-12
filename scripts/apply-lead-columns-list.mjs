/**
 * Additive Migration: lead_columns.lead_list_id (Ordner-Zuordnung einer Spalte).
 * NULL = globale Spalte (in JEDEM Ordner sichtbar — alle Standard-Spalten).
 * Gesetzt = selbst angelegte Spalte, die NUR in ihrem eigenen Ordner erscheint.
 * ON DELETE CASCADE → löscht man einen Ordner, verschwinden auch seine Spalten.
 * Idempotent. Aufruf: node scripts/apply-lead-columns-list.mjs
 * (drizzle-kit push ist hier kaputt → DDL direkt anwenden.)
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const url = env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt in .env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });
try {
  await sql`ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS lead_list_id uuid REFERENCES lead_lists(id) ON DELETE CASCADE`;
  await sql`CREATE INDEX IF NOT EXISTS lead_columns_list_idx ON lead_columns(lead_list_id)`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM lead_columns WHERE lead_list_id IS NOT NULL`;
  console.log(`OK: lead_columns.lead_list_id + Index vorhanden. Ordner-Spalten bisher: ${n}`);
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
