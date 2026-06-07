// Einmaliges, idempotentes Anlegen der lead_columns-Tabelle + Enum.
// Umgeht den drizzle-kit-push-Introspektions-Bug; rein additive DDL.
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
    DO $$ BEGIN
      CREATE TYPE lead_column_kind AS ENUM ('source','data','enrichment','action');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS lead_columns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key text NOT NULL,
      label text NOT NULL,
      kind lead_column_kind NOT NULL,
      data_type text NOT NULL DEFAULT 'text',
      position integer NOT NULL,
      width integer NOT NULL DEFAULT 180,
      pinned boolean NOT NULL DEFAULT false,
      color text,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      hidden boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS lead_columns_org_idx ON lead_columns(org_id);`,
  );

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_name = 'lead_columns'
  `;
  console.log("OK — lead_columns vorhanden:", count === 1);
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
