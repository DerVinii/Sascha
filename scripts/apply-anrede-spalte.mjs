/**
 * Einmalige Migration: aus den pro Ordner selbst angelegten "Anrede"-Spalten
 * wird EINE globale Standard-Spalte (key "anrede"), die in jedem Ordner direkt
 * hinter "E-Mail" steht und von "Update cells" gefüllt wird.
 *
 * Schritte (idempotent, mehrfach aufrufbar):
 *  1. Kanonische Spalte "anrede" global machen (lead_list_id = NULL, config = {},
 *     kind = data) — bzw. anlegen, falls die Org noch keine hat.
 *  2. Zellwerte der Duplikate (anrede_2, anrede_3, …) nach cells["anrede"] ziehen.
 *  3. Werte vereinheitlichen: aus "Herr"/"Frau" wird "Herr <Nachname>";
 *     "Unbekannt"/"NF"/leer wird entfernt, damit der nächste Lauf sie neu füllt.
 *  4. Duplikat-Spalten löschen und die Spalten-Reihenfolge neu durchnummerieren.
 *
 * Aufruf:  node scripts/apply-anrede-spalte.mjs [--apply]
 * Ohne --apply läuft nur die Vorschau (kein Schreibzugriff).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const KEY = "anrede";

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

/** "Herr"/"Frau" → "Herr Aris"; Unbrauchbares → "" (Zelle wird entfernt). */
function normalisiere(value, nachname) {
  const wert = String(value ?? "").trim();
  if (!wert) return "";
  const woerter = wert.split(/\s+/);
  if (woerter.length === 1) {
    const einzeln = woerter[0].replace(/[.,;:]+$/, "");
    if (/^(herr|frau)$/i.test(einzeln)) {
      const nn = String(nachname ?? "").trim();
      if (!nn) return ""; // ohne Nachnamen keine Anrede — neu erzeugen lassen
      const anrede = einzeln[0].toUpperCase() + einzeln.slice(1).toLowerCase();
      return `${anrede} ${nn}`;
    }
    return ""; // "Unbekannt", "NF", Einzelwort ohne Anrede → neu erzeugen
  }
  return wert;
}

const sql = postgres(url, { prepare: false });
const protokoll = [];
const log = (...a) => {
  const zeile = a.join(" ");
  protokoll.push(zeile);
  console.log(zeile);
};

try {
  const orgs = await sql`SELECT id, name FROM organizations ORDER BY created_at`;

  for (const org of orgs) {
    log(`\n=== Org ${org.name} (${String(org.id).slice(0, 8)}) ===`);

    const cols =
      await sql`SELECT id, key, label, kind, data_type, position, width, color, hidden, lead_list_id, config
                FROM lead_columns WHERE org_id = ${org.id} ORDER BY position`;

    const emailCol = cols.find((c) => c.key === "email");
    let kanonisch = cols.find((c) => c.key === KEY) ?? null;
    // Duplikate: gleiche Bedeutung, aber eigener Key pro Ordner (anrede_2, …).
    const duplikate = cols.filter(
      (c) => c.key !== KEY && /^anrede(_\d+)?$/i.test(c.key),
    );

    log(
      `Spalten: ${cols.length} | kanonische "anrede": ${kanonisch ? "ja" : "nein"} | Duplikate: ${
        duplikate.map((d) => d.key).join(", ") || "keine"
      }`,
    );

    // --- 1. Kanonische Spalte global + als reine Daten-Spalte ----------------
    if (!kanonisch) {
      log(`  + lege globale Spalte "Anrede" an`);
      if (APPLY) {
        const [neu] = await sql`
          INSERT INTO lead_columns (org_id, lead_list_id, key, label, kind, data_type, position, width, pinned, color, config, hidden)
          VALUES (${org.id}, NULL, ${KEY}, 'Anrede', 'data', 'text',
                  ${(emailCol?.position ?? cols.length) + 1}, 180, false, NULL, '{}'::jsonb, false)
          RETURNING id, key, position`;
        kanonisch = { ...neu, label: "Anrede" };
      }
    } else if (kanonisch.lead_list_id || Object.keys(kanonisch.config ?? {}).length) {
      log(
        `  ~ mache "anrede" global (bisher Ordner ${String(kanonisch.lead_list_id ?? "-").slice(0, 8)}) und entferne den eigenen KI-Prompt`,
      );
      if (APPLY) {
        await sql`UPDATE lead_columns
                  SET lead_list_id = NULL, config = '{}'::jsonb, kind = 'data',
                      data_type = 'text', label = 'Anrede', hidden = false
                  WHERE id = ${kanonisch.id}`;
      }
    }

    // --- 2./3. Zellwerte zusammenführen und vereinheitlichen -----------------
    // Alt-Keys auch dort einsammeln, wo die Spalte schon gelöscht wurde: die
    // Werte liegen dann verwaist im JSON und wären sonst unwiederbringlich weg.
    const verwaist = await sql`
      SELECT DISTINCT k FROM contacts, jsonb_object_keys(custom_fields -> 'cells') AS k
      WHERE org_id = ${org.id}
        AND jsonb_typeof(custom_fields -> 'cells') = 'object'
        AND k ~ '^anrede(_[0-9]+)?$' AND k <> ${KEY}`;
    const dupKeys = [
      ...new Set([...duplikate.map((d) => d.key), ...verwaist.map((r) => r.k)]),
    ];
    const relevanteKeys = [KEY, ...dupKeys];
    const rows = await sql`
      SELECT id, last_name, custom_fields
      FROM contacts
      WHERE org_id = ${org.id}
        AND custom_fields -> 'cells' ?| ${sql.array(relevanteKeys)}`;

    let uebernommen = 0;
    let vereinheitlicht = 0;
    let geleert = 0;
    const sicherung = [];

    for (const row of rows) {
      const cf = row.custom_fields ?? {};
      const cells = { ...(cf.cells ?? {}) };
      const vorher = JSON.stringify(cells[KEY] ?? null);

      // Duplikat-Zelle übernehmen, wenn die Standard-Zelle noch leer ist.
      let zelle = cells[KEY] ?? null;
      const zelleLeer =
        !zelle || String(zelle.value ?? "").trim() === "";
      if (zelleLeer) {
        for (const k of dupKeys) {
          const kandidat = cells[k];
          if (kandidat && String(kandidat.value ?? "").trim() !== "") {
            zelle = { ...kandidat };
            uebernommen++;
            break;
          }
        }
      }
      if (!zelle) continue;

      const neuerWert = normalisiere(zelle.value, row.last_name);
      if (neuerWert === "") {
        if (cells[KEY]) geleert++;
        delete cells[KEY];
      } else {
        if (neuerWert !== String(zelle.value ?? "").trim()) vereinheitlicht++;
        cells[KEY] = { ...zelle, value: neuerWert, status: "success" };
      }
      // Duplikat-Zellen bleiben als stille Sicherung im JSON stehen — sie sind
      // ohne zugehörige Spalte unsichtbar und kosten nichts.

      if (JSON.stringify(cells[KEY] ?? null) === vorher) continue;
      sicherung.push({ id: row.id, custom_fields: cf });
      if (APPLY) {
        // sql.json() ist Pflicht: ein roher JSON-String würde als jsonb-String
        // (statt als Objekt) landen und die ganze Zell-Struktur unlesbar machen.
        await sql`UPDATE contacts
                  SET custom_fields = coalesce(custom_fields, '{}'::jsonb)
                        || jsonb_build_object('cells', ${sql.json(cells)}::jsonb)
                  WHERE id = ${row.id}`;
      }
    }
    log(
      `  Zeilen mit Anrede-Daten: ${rows.length} | übernommen: ${uebernommen} | umformuliert: ${vereinheitlicht} | zum Neubefüllen geleert: ${geleert}`,
    );

    // --- 4. Duplikat-Spalten löschen ----------------------------------------
    if (duplikate.length) {
      log(`  - lösche Spalten: ${duplikate.map((d) => d.key).join(", ")}`);
      if (APPLY) {
        await sql`DELETE FROM lead_columns WHERE id = ANY(${sql.array(duplikate.map((d) => d.id))}::uuid[])`;
      }
    }

    // --- 5. Reihenfolge neu durchnummerieren (Anrede direkt hinter E-Mail) ---
    if (APPLY && kanonisch) {
      const rest =
        await sql`SELECT id, key FROM lead_columns WHERE org_id = ${org.id} ORDER BY position, created_at`;
      const ohneAnrede = rest.filter((c) => c.key !== KEY);
      const anrede = rest.find((c) => c.key === KEY);
      const idx = ohneAnrede.findIndex((c) => c.key === "email");
      const sortiert = [...ohneAnrede];
      if (anrede) sortiert.splice(idx >= 0 ? idx + 1 : sortiert.length, 0, anrede);
      for (let i = 0; i < sortiert.length; i++) {
        await sql`UPDATE lead_columns SET position = ${i} WHERE id = ${sortiert[i].id}`;
      }
      log(`  Reihenfolge: ${sortiert.map((c) => c.key).join(" → ")}`);
    }

    if (sicherung.length && APPLY) {
      // Bewusst außerhalb des Repos: die Sicherung enthält Kundendaten.
      const datei = join(tmpdir(), `anrede-backup-${String(org.id).slice(0, 8)}.json`);
      writeFileSync(datei, JSON.stringify(sicherung, null, 2));
      log(`  Sicherung der alten Zellen: ${datei} (${sicherung.length} Zeilen)`);
    }
  }

  log(
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
