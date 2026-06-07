/**
 * Additive Migration: lead_lists.instantly_campaign_id (1:1-Link zur Instantly-Kampagne).
 * Idempotent. Aufruf: node scripts/apply-instantly-campaign-id.mjs
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
  await sql`ALTER TABLE lead_lists ADD COLUMN IF NOT EXISTS instantly_campaign_id text`;
  console.log("OK: lead_lists.instantly_campaign_id vorhanden.");
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
