/**
 * Migration: partiellen Unique-Index auf lead_lists.pipeline_id entfernen.
 *
 * Bisher erzwang `lead_lists_pipeline_unique` (UNIQUE WHERE pipeline_id IS NOT
 * NULL) eine 1:1-Kopplung Ordner↔Pipeline. Neu (n:1): mehrere Ordner dürfen
 * dieselbe Pipeline speisen; ihre Leads werden dort als Deals addiert. Der
 * normale (nicht-unique) Index lead_lists_pipeline_idx bleibt für die Lookups.
 *
 * Idempotent: DROP INDEX IF EXISTS. Aufruf: node scripts/drop-lead-lists-pipeline-unique.mjs
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
  await sql`DROP INDEX IF EXISTS lead_lists_pipeline_unique`;
  const rows =
    await sql`SELECT indexname FROM pg_indexes WHERE tablename='lead_lists' AND indexname='lead_lists_pipeline_unique'`;
  console.log(
    rows.length === 0
      ? "OK: Unique-Index lead_lists_pipeline_unique entfernt — mehrere Ordner je Pipeline sind jetzt erlaubt."
      : "WARN: Index existiert noch.",
  );
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
