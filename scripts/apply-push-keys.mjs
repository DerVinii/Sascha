/**
 * Additive Migration: Tabelle push_keys (VAPID-Schlüsselpaar für Web-Push).
 *
 * Genau eine Zeile, erzwungen über CHECK (id = 'singleton'). Liegt bereits ein
 * Paar in .env.local, wird es übernommen — dann benutzen lokale Umgebung und
 * Produktion denselben Schlüssel. Sonst erzeugt der Server sich beim ersten
 * Aufruf selbst eines (siehe src/lib/server/push.ts).
 *
 * Idempotent. Aufruf: node scripts/apply-push-keys.mjs
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
  await sql`
    CREATE TABLE IF NOT EXISTS push_keys (
      id text PRIMARY KEY DEFAULT 'singleton',
      public_key text NOT NULL,
      private_key text NOT NULL,
      subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT push_keys_singleton CHECK (id = 'singleton')
    )`;
  console.log("OK: Tabelle push_keys vorhanden.");

  const vorhanden = await sql`SELECT id FROM push_keys LIMIT 1`;
  if (vorhanden.length > 0) {
    console.log("OK: Schlüsselpaar liegt bereits in der DB — nichts geändert.");
  } else if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    const subject = env.VAPID_SUBJECT || `mailto:${env.POSTFACH_EMAIL ?? ""}`;
    await sql`
      INSERT INTO push_keys (public_key, private_key, subject)
      VALUES (${env.VAPID_PUBLIC_KEY}, ${env.VAPID_PRIVATE_KEY}, ${subject})
      ON CONFLICT DO NOTHING`;
    // Nie den privaten Schlüssel ausgeben.
    console.log("OK: Schlüsselpaar aus .env.local übernommen.");
  } else {
    console.log(
      "Hinweis: kein Paar in .env.local — der Server legt beim ersten Aufruf selbst eines an.",
    );
  }
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
