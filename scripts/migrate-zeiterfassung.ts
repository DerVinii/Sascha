/**
 * Migration für die Zeiterfassung (Mitarbeiter, Geräte, Stempelzeiten).
 * Idempotent — kann gefahrlos mehrfach laufen.
 *
 *   npx tsx scripts/migrate-zeiterfassung.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt (.env.local)");

const sql = postgres(url, { prepare: false });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS employees_org_idx ON employees (org_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS employees_org_name_unique ON employees (org_id, name)`;

  await sql`
    CREATE TABLE IF NOT EXISTS employee_devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      token_lookup text NOT NULL UNIQUE,
      label text,
      user_agent text,
      enrolled_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      revoked boolean NOT NULL DEFAULT false
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS employee_devices_employee_idx ON employee_devices (employee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS employee_devices_org_idx ON employee_devices (org_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS enrollment_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      token_lookup text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS enrollment_tokens_employee_idx ON enrollment_tokens (employee_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS time_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      clock_in timestamptz NOT NULL,
      clock_out timestamptz,
      sick boolean NOT NULL DEFAULT false,
      was_edited boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS time_entries_employee_clockin_idx ON time_entries (employee_id, clock_in)`;
  await sql`CREATE INDEX IF NOT EXISTS time_entries_org_idx ON time_entries (org_id)`;
  // Höchstens ein laufender Eintrag pro Mitarbeiter (partieller Unique-Index).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS time_entries_open_unique
      ON time_entries (employee_id) WHERE clock_out IS NULL
  `;

  // Das Änderungsprotokoll überlebt bewusst das Löschen eines Zeiteintrags
  // (ON DELETE SET NULL statt CASCADE) — sonst nähme eine Löschung ihre eigene
  // Spur mit. Am Mitarbeiter hängt es weiterhin per CASCADE (DSGVO-Löschung).
  await sql`
    CREATE TABLE IF NOT EXISTS time_edit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      time_entry_id uuid REFERENCES time_entries(id) ON DELETE SET NULL,
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      field_changed text NOT NULL,
      old_value timestamptz,
      new_value timestamptz,
      entry_clock_in timestamptz,
      entry_clock_out timestamptz,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Erst die Spalten nachziehen (die Tabelle kann aus einem früheren Lauf noch
  // die alte Form haben — CREATE TABLE IF NOT EXISTS ändert dann nichts), danach
  // die Indizes anlegen. Umgekehrt scheitert der Index auf employee_id.
  await sql`ALTER TABLE time_edit_logs ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE time_edit_logs ADD COLUMN IF NOT EXISTS entry_clock_in timestamptz`;
  await sql`ALTER TABLE time_edit_logs ADD COLUMN IF NOT EXISTS entry_clock_out timestamptz`;
  await sql`ALTER TABLE time_edit_logs ALTER COLUMN time_entry_id DROP NOT NULL`;
  // Fremdschlüssel auf time_entry_id von CASCADE auf SET NULL umstellen.
  // Der Constraint-Name wird nicht geraten, sondern nachgeschlagen: je nachdem,
  // ob die Tabelle über dieses Skript (Postgres-Default `_fkey`) oder über
  // Drizzle (`_time_entries_id_fk`) entstanden ist, heißt er anders.
  await sql`
    DO $$
    DECLARE
      c_name text;
    BEGIN
      SELECT con.conname INTO c_name
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.conrelid = 'time_edit_logs'::regclass
        AND con.contype = 'f'
        AND att.attname = 'time_entry_id'
        AND con.confdeltype = 'c'
      LIMIT 1;

      IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE time_edit_logs DROP CONSTRAINT %I', c_name);
        EXECUTE format(
          'ALTER TABLE time_edit_logs ADD CONSTRAINT %I
             FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE SET NULL',
          c_name);
      END IF;
    END $$
  `;
  // Bestandszeilen ohne employee_id aus ihrem Eintrag befüllen, dann NOT NULL.
  await sql`
    UPDATE time_edit_logs l SET employee_id = e.employee_id
    FROM time_entries e WHERE l.time_entry_id = e.id AND l.employee_id IS NULL
  `;
  await sql`DELETE FROM time_edit_logs WHERE employee_id IS NULL`;
  await sql`ALTER TABLE time_edit_logs ALTER COLUMN employee_id SET NOT NULL`;

  await sql`CREATE INDEX IF NOT EXISTS time_edit_logs_entry_idx ON time_edit_logs (time_entry_id)`;
  await sql`CREATE INDEX IF NOT EXISTS time_edit_logs_employee_idx ON time_edit_logs (employee_id)`;

  console.log(
    "✅ Migration angewendet: employees, employee_devices, enrollment_tokens, time_entries, time_edit_logs",
  );
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error("❌ Migration fehlgeschlagen:", e);
    await sql.end();
    process.exit(1);
  });
