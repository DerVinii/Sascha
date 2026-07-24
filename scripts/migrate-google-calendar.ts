/**
 * Einmalige Migration für die Google-Kalender-Anbindung.
 * Idempotent — kann gefahrlos mehrfach laufen.
 *
 *   npx tsx scripts/migrate-google-calendar.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (.env.local)");

const sql = postgres(url, { prepare: false });

async function main() {
  await sql`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id text`;
  await sql`CREATE INDEX IF NOT EXISTS calendar_events_google_idx ON calendar_events (google_event_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS google_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      email text,
      access_token text,
      refresh_token text NOT NULL,
      token_expiry timestamptz,
      calendar_id text NOT NULL DEFAULT 'primary',
      sync_token text,
      last_synced_at timestamptz,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log("✅ Migration angewendet: google_accounts + calendar_events.google_event_id");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error("❌ Migration fehlgeschlagen:", e);
    await sql.end();
    process.exit(1);
  });
