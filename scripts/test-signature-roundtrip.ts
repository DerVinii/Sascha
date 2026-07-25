/**
 * End-to-End-Prüfung der Signatur-Speicherung gegen die echte Datenbank:
 * anlegen → mit Bild speichern → Standard setzen → wieder löschen.
 *
 * Legt nur temporäre Testdaten an und räumt sie am Ende wieder ab.
 *
 * Aufruf: npx tsx scripts/test-signature-roundtrip.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TEST_NAME = "__TEST-Signatur (bitte ignorieren)";

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

async function main() {
  const { requireActiveOrg } = await import("../src/lib/server/active-org");
  const { createSignature, deleteSignature, listSignatures, updateSignature } =
    await import("../src/lib/server/signatures");

  const org = await requireActiveOrg();
  console.log(`Organisation: ${org.name}\n`);

  const before = await listSignatures(org.id);
  let id: string | null = null;

  try {
    console.log("1) Anlegen");
    let list = await createSignature(org.id, TEST_NAME);
    const created = list.find((s) => s.name === TEST_NAME);
    check("Signatur angelegt", Boolean(created));
    if (!created) throw new Error("Anlegen fehlgeschlagen");
    id = created.id;
    check("Startzustand leer", created.html === "");

    console.log("\n2) Speichern mit Bild");
    const html =
      `<div><b>Sascha Kühn</b><br><span style="font-size:11pt">Dozent und Coach</span></div>` +
      `<div><img src="data:image/png;base64,${PNG}" alt="Logo" width="240" height="80" style="width:240px;height:80px;"></div>`;
    list = await updateSignature(org.id, id, { html });
    const saved = list.find((s) => s.id === id);
    check("Bild-Data-URI unverändert gespeichert", saved?.html.includes(PNG) === true);
    check("Maße erhalten", /width="240"/.test(saved?.html ?? ""));
    check("Formatierung erhalten", /<b>Sascha Kühn<\/b>/.test(saved?.html ?? ""));

    console.log("\n3) Umbenennen");
    list = await updateSignature(org.id, id, { name: `${TEST_NAME} 2` });
    check("Name aktualisiert", list.find((s) => s.id === id)?.name === `${TEST_NAME} 2`);
    check("HTML dabei unangetastet", list.find((s) => s.id === id)?.html.includes(PNG) === true);

  } finally {
    console.log("\n4) Aufräumen");
    if (id) {
      const list = await deleteSignature(org.id, id);
      check("Testsignatur gelöscht", !list.some((s) => s.id === id));
    }
    const after = await listSignatures(org.id);
    check("Datenbestand wie vorher", after.length === before.length, `${after.length}/${before.length}`);
  }

  console.log(
    failures.length === 0
      ? "\nAlle Prüfungen bestanden.\n"
      : `\nFEHLGESCHLAGEN (${failures.length}): ${failures.join(", ")}\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error("FEHLER:", err instanceof Error ? err.message : err);
  process.exit(1);
});
