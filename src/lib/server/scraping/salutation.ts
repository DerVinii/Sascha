/**
 * Standard-Spalte "Anrede" — formuliert aus Vor- und Nachname eine höfliche
 * Anrede ("Herr Aris").
 *
 * Der Prompt steht bewusst fest im Code und ist NICHT über die Oberfläche
 * änderbar: Die Spalte soll sich wie Vorname/Nachname/E-Mail verhalten und in
 * jedem Ordner dasselbe Format liefern, damit {{anrede}} in den Kampagnen-Mails
 * verlässlich auflöst.
 *
 * Gefüllt wird sie vom "Update cells"-Lauf (enrich-run.ts, Phase 1.5) — direkt
 * nachdem die Geschäftsführer-Suche Vor- und Nachname geschrieben hat.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runAiColumn } from "./ai-column";
import { cellPatch, type RowSources } from "./lead-columns";
import { SALUTATION_KEY, type LeadColumn } from "@/lib/scraping-types";

/** Wortlaut wie vorgegeben — nicht editierbar. */
export const SALUTATION_PROMPT = `Anhand des Vornamens und des Nachnamens, welche du als Kontext hast, sollst du das Geschlecht herausfinden und eine höfliche Anrede formulieren.

Bsp.:
Vorname: Vincent
Nachname: Aris
Ergebnis: Herr Aris`;

export type SalutationOutcome = {
  status: "success" | "not_found" | "error";
  /** Provider-Fehlermeldung — der Aufrufer entscheidet über den Rate-Limit-Abbruch. */
  error?: string;
};

/** Beide Namensteile nötig: der Vorname liefert das Geschlecht, der Nachname die Anrede. */
export function salutationReady(contact: RowSources["contact"]): boolean {
  return !!contact.firstName?.trim() && !!contact.lastName?.trim();
}

/**
 * Modellantwort auf den reinen Zellwert eindampfen: eine Zeile wie "Herr Aris",
 * ohne "Ergebnis:"-Präfix, Anführungszeichen oder Satzzeichen. Leerer String =
 * nichts Brauchbares (auch bei Fließtext, den das Modell manchmal liefert).
 */
export function cleanSalutation(raw: string): string {
  const zeile = raw
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  if (!zeile) return "";
  const wert = zeile
    .replace(/^(ergebnis|anrede|antwort|ausgabe)\s*[:\-–]\s*/i, "")
    .replace(/^["'„»]+|["'“«]+$/g, "")
    .replace(/[.;,!]+$/, "")
    .trim();
  if (!wert || wert.toUpperCase() === "NF") return "";
  // Sicherheitsnetz: alles, was nach Erklärung klingt, ist keine Anrede.
  if (wert.length > 60 || wert.split(/\s+/).length > 5) return "";
  return wert;
}

/** Bereits gespeicherte Zelle einer Zeile (Rohform aus customFields.cells). */
function storedCell(
  src: RowSources,
  key: string,
): { value?: unknown; status?: string } | null {
  const cells = src.contact.customFields?.cells as
    | Record<string, { value?: unknown; status?: string }>
    | undefined;
  return cells?.[key] ?? null;
}

/**
 * Zeilen, für die "Update cells" eine Anrede erzeugen soll: Name vorhanden,
 * Zelle leer. Bewusst NICHT erneut versucht werden Zeilen mit Status
 * "not_found" — das Modell hat es dort schon versucht, ein Wiederholen bei
 * jedem Lauf würde nur Kontingent verbrennen (manuell überschreiben geht immer).
 */
export function salutationMissingRows(
  column: LeadColumn,
  all: RowSources[],
  /** retryNotFound: auch Zeilen mitnehmen, an denen das Modell schon gescheitert
   *  ist. Für den ausdrücklichen Klick auf "Fehlende ausführen" — dort will der
   *  Nutzer genau die leeren Zellen sehen, egal warum sie leer sind. */
  opts?: { retryNotFound?: boolean },
): RowSources[] {
  // Hat der Nutzer der Spalte einen eigenen KI-Prompt gegeben, gehört sie ihm:
  // dann füllt sie die KI-Spalten-Mechanik und nicht dieser Standard-Lauf.
  if (column.config.ai) return [];
  return all.filter((src) => {
    if (!salutationReady(src.contact)) return false;
    const cell = storedCell(src, column.key);
    if (cell?.status === "running") return false;
    if (cell?.status === "not_found" && !opts?.retryNotFound) return false;
    const wert = cell?.value == null ? "" : String(cell.value).trim();
    return wert === "";
  });
}

async function writeCell(
  orgId: string,
  columnKey: string,
  contactId: string,
  cell: Record<string, unknown>,
): Promise<void> {
  await db
    .update(contacts)
    .set({ customFields: cellPatch(columnKey, cell) })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
}

export async function runSalutationForRow(
  orgId: string,
  column: LeadColumn,
  src: RowSources,
): Promise<SalutationOutcome> {
  const runAt = new Date().toISOString();
  const vorname = src.contact.firstName?.trim() ?? "";
  const nachname = src.contact.lastName?.trim() ?? "";

  try {
    const antwort = await runAiColumn(
      SALUTATION_PROMPT,
      { Vorname: vorname, Nachname: nachname },
      // Ohne Google-Suche: Das Geschlecht steckt im Vornamen — eine Suche würde
      // pro Zeile nur Zeit kosten und das Modell vom Format ablenken.
      { search: false },
    );
    const wert = cleanSalutation(antwort);
    await writeCell(orgId, column.key, src.contact.id, {
      status: wert ? "success" : "not_found",
      provider: "gemini",
      runAt,
      error: null,
      value: wert,
      raw: { vorname, nachname, antwort },
    });
    return { status: wert ? "success" : "not_found" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    await writeCell(orgId, column.key, src.contact.id, {
      status: "error",
      provider: null,
      runAt,
      error: message.slice(0, 300),
      value: "",
      raw: null,
    });
    return { status: "error", error: message };
  }
}

export { SALUTATION_KEY };
