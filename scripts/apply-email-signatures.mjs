// Idempotente Migration: Tabelle email_signatures (mehrere benannte
// E-Mail-Signaturen pro Organisation, inkl. Outlook-artiger Standardauswahl
// für neue Nachrichten bzw. Antworten/Weiterleitungen).
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
    CREATE TABLE IF NOT EXISTS email_signatures (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      html text NOT NULL DEFAULT '',
      default_new boolean NOT NULL DEFAULT false,
      default_reply boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS email_signatures_org_idx ON email_signatures(org_id);`,
  );

  const rows = await sql`SELECT count(*)::int AS c FROM email_signatures`;
  console.log("email_signatures bereit — vorhandene Signaturen:", rows[0].c);
  console.log("OK");
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
