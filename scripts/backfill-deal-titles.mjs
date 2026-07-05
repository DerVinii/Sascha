/**
 * Backfill: Firmenname in bestehende Deal-Titel aufnehmen.
 *
 * Bisher war der Firmenname im Deal-Titel nur ein letzter Fallback (Person →
 * E-Mail → Firma). Neu: der Firmenname ist – sofern vorhanden – IMMER Teil des
 * Titels ("Person · Firma"). Dieses Skript bringt bestehende Deals auf dieselbe
 * Form.
 *
 * Sicher & idempotent: aktualisiert NUR Deals, deren Kontakt eine Firma hat UND
 * deren aktueller Titel den Firmennamen noch nicht enthält. Bereits korrekte
 * oder manuell mit Firma benannte Titel bleiben unangetastet; erneutes Ausführen
 * ändert nichts mehr.
 *
 * Aufruf: node scripts/backfill-deal-titles.mjs
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

/** Muss mit dealTitleFrom() in src/lib/server/pipeline-sync.ts übereinstimmen. */
function dealTitleFrom(c) {
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const company = (c.companyName ?? "").trim();
  const who = person || (c.email ?? "").trim();
  if (who && company) return `${who} · ${company}`;
  return company || who || "Neuer Lead";
}

const sql = postgres(url, { prepare: false });
try {
  const rows = await sql`
    SELECT d.id,
           d.title       AS title,
           c.first_name  AS "firstName",
           c.last_name   AS "lastName",
           c.email       AS email,
           co.name       AS "companyName"
    FROM deals d
    JOIN contacts c  ON c.id = d.contact_id
    JOIN companies co ON co.id = c.company_id
    WHERE co.name IS NOT NULL AND co.name <> ''
  `;

  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const company = (r.companyName ?? "").trim();
    const current = r.title ?? "";
    // Firma schon im Titel enthalten (bereits korrekt oder manuell benannt)? → nicht anfassen.
    if (company && current.toLowerCase().includes(company.toLowerCase())) {
      skipped++;
      continue;
    }
    const next = dealTitleFrom(r);
    if (next === current) {
      skipped++;
      continue;
    }
    await sql`UPDATE deals SET title = ${next} WHERE id = ${r.id}`;
    updated++;
  }

  console.log(
    `OK: ${updated} Deal-Titel um den Firmennamen ergänzt, ${skipped} unverändert (von ${rows.length} Deals mit Firma).`,
  );
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
