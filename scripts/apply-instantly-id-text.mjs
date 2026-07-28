/**
 * Migration: instantly_emails.{id,thread_id,campaign_id} von uuid → text.
 *
 * Instantly-Bezeichner sind keine garantierten UUIDs (die v2-API liefert
 * zunehmend präfixierte IDs wie "ac-e9MU…"). Als uuid-Spalten bricht der Sync
 * mit „invalid input syntax for type uuid" ab. Idempotent (uuid→text-Casts
 * sind verlustfrei; ein erneuter Lauf auf bereits-text ist ein No-Op).
 * Aufruf: node scripts/apply-instantly-id-text.mjs
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
  await sql`ALTER TABLE instantly_emails ALTER COLUMN id TYPE text USING id::text`;
  await sql`ALTER TABLE instantly_emails ALTER COLUMN thread_id TYPE text USING thread_id::text`;
  await sql`ALTER TABLE instantly_emails ALTER COLUMN campaign_id TYPE text USING campaign_id::text`;
  console.log("OK: instantly_emails.{id,thread_id,campaign_id} sind jetzt text.");
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
