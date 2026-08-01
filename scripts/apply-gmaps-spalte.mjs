/**
 * Einmalige Migration: Die Standard-Spalte "Google Maps" war seit dem Seeding
 * auf `hidden = true` gesetzt und tauchte deshalb in keiner Tabelle auf,
 * obwohl der Link beim Scrapen immer mitgespeichert wurde.
 *
 * Dieses Skript blendet sie ein und schiebt sie an ihren Platz: direkt hinter
 * "Webseite" und vor "Rating" (so wie in den alten Tabellen).
 *
 * Idempotent. Aufruf:  node scripts/apply-gmaps-spalte.mjs [--apply]
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

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
  const orgs = await sql`SELECT id, name FROM organizations ORDER BY created_at`;

  for (const org of orgs) {
    const cols =
      await sql`SELECT id, key, label, position, hidden FROM lead_columns
                WHERE org_id = ${org.id} ORDER BY position, created_at`;
    const gmaps = cols.find((c) => c.key === "gmaps");
    console.log(`\n=== ${org.name} ===`);
    if (!gmaps) {
      console.log("  keine Spalte 'gmaps' — wird beim nächsten Seeding angelegt");
      continue;
    }
    console.log(
      `  bisher: Position ${gmaps.position}, ${gmaps.hidden ? "ausgeblendet" : "sichtbar"}`,
    );

    // Reihenfolge: gmaps direkt hinter 'website'.
    const ohne = cols.filter((c) => c.key !== "gmaps");
    const idx = ohne.findIndex((c) => c.key === "website");
    const sortiert = [...ohne];
    sortiert.splice(idx >= 0 ? idx + 1 : sortiert.length, 0, gmaps);
    console.log(`  neu:    ${sortiert.map((c) => c.key).join(" → ")}`);

    if (APPLY) {
      await sql`UPDATE lead_columns SET hidden = false WHERE id = ${gmaps.id}`;
      for (let i = 0; i < sortiert.length; i++) {
        await sql`UPDATE lead_columns SET position = ${i} WHERE id = ${sortiert[i].id}`;
      }
    }
  }

  console.log(
    APPLY
      ? "\nFertig — Änderungen wurden geschrieben."
      : "\nVorschau (nichts geschrieben). Mit --apply ausführen.",
  );
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
