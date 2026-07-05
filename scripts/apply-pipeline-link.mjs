/**
 * Additive Migration: lead_lists.pipeline_id (1:1-Link Ordner ↔ Pipeline).
 * Ordner-Leads werden als Deals in die Pipeline gespiegelt ("Mit Pipeline verbinden").
 * ON DELETE SET NULL → löscht man die Pipeline, wird der Ordner automatisch entkoppelt.
 * Idempotent. Aufruf: node scripts/apply-pipeline-link.mjs
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
  await sql`ALTER TABLE lead_lists ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS lead_lists_pipeline_idx ON lead_lists(pipeline_id)`;
  // 1:1 erzwingen: eine Pipeline darf mit höchstens EINEM Ordner verbunden sein.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS lead_lists_pipeline_unique ON lead_lists(pipeline_id) WHERE pipeline_id IS NOT NULL`;
  console.log("OK: lead_lists.pipeline_id + Index + Unique-Index vorhanden.");
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
