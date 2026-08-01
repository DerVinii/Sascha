/**
 * Spalten-Definitionen + Zell-Adapter der Clay-artigen Lead-Table.
 *
 * - DEFAULT_COLUMNS werden pro Org idempotent geseedet.
 * - buildCells() mappt einen contact⟕company-Join auf die Zell-Struktur, die
 *   das Grid rendert. Liest sowohl das neue `customFields.cells`-Format als auch
 *   das alte `customFields.enrichment` (done/not_found) → keine Daten-Migration.
 */

import { db } from "@/db";
import { contacts, leadColumns } from "@/db/schema";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  EMAIL_FINDER_KEY,
  ENRICHMENT_KEY,
  SALUTATION_KEY,
} from "@/lib/scraping-types";
import type {
  CellStatus,
  LeadCell,
  LeadColumn,
  LeadColumnConfig,
  LeadView,
  OnlyRunIf,
} from "@/lib/scraping-types";

export { EMAIL_FINDER_KEY, ENRICHMENT_KEY, SALUTATION_KEY };

/** jsonb-Merge, der cells[columnKey] setzt und alles andere erhält. */
export function cellPatch(columnKey: string, cell: Record<string, unknown>) {
  const patch = JSON.stringify({ [columnKey]: cell });
  return sql`coalesce(${contacts.customFields}, '{}'::jsonb) || jsonb_build_object('cells', coalesce(${contacts.customFields} -> 'cells', '{}'::jsonb) || ${patch}::jsonb)`;
}

type ColumnSeed = Omit<LeadColumn, "id">;

export const DEFAULT_COLUMNS: ColumnSeed[] = [
  {
    key: "company",
    label: "Firma",
    kind: "source",
    dataType: "text",
    position: 0,
    width: 220,
    pinned: true,
    color: null,
    hidden: false,
    config: { source: "company.name" },
  },
  {
    key: "address",
    label: "Adresse",
    kind: "source",
    dataType: "text",
    position: 1,
    width: 240,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "company.address.formatted" },
  },
  {
    key: "phone",
    label: "Telefon",
    kind: "source",
    dataType: "text",
    position: 2,
    width: 140,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "contact.phone" },
  },
  {
    key: "website",
    label: "Webseite",
    kind: "source",
    dataType: "url",
    position: 3,
    width: 180,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "company.customFields.websiteUri" },
  },
  {
    key: "rating",
    label: "Rating",
    kind: "source",
    dataType: "rating",
    position: 4,
    width: 100,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "company.customFields.rating" },
  },
  {
    key: "gmaps",
    label: "Google Maps",
    kind: "source",
    dataType: "url",
    position: 5,
    width: 130,
    pinned: false,
    color: null,
    hidden: true,
    config: { source: "company.customFields.googleMapsUri" },
  },
  {
    key: ENRICHMENT_KEY,
    label: "Geschäftsführer finden",
    kind: "enrichment",
    dataType: "text",
    position: 6,
    width: 200,
    pinned: false,
    color: "info",
    // Reine Engine-Spalte: treibt "Update cells" (schreibt Vorname/Nachname/E-Mail
    // zurück), wird aber selbst nicht im Grid angezeigt.
    hidden: true,
    config: {
      provider: ["gemini"],
      inputs: {
        Firmenname: "company.name",
        Webseite: "company.customFields.websiteUri",
        "Google Maps Link": "company.customFields.googleMapsUri",
      },
      outputs: [
        { field: "vorname", label: "Vorname", type: "text" },
        { field: "nachname", label: "Nachname", type: "text" },
        { field: "email", label: "E-Mail", type: "email" },
      ],
      runSettings: { autoUpdate: false, onlyRunIf: "name_empty" },
    },
  },
  {
    key: "firstName",
    label: "Vorname",
    kind: "data",
    dataType: "text",
    position: 7,
    width: 130,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "contact.firstName" },
  },
  {
    key: "lastName",
    label: "Nachname",
    kind: "data",
    dataType: "text",
    position: 8,
    width: 140,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "contact.lastName" },
  },
  {
    key: "email",
    label: "E-Mail",
    kind: "data",
    dataType: "email",
    position: 9,
    width: 220,
    pinned: false,
    color: null,
    hidden: false,
    config: { source: "contact.email" },
  },
  {
    key: SALUTATION_KEY,
    label: "Anrede",
    kind: "data",
    dataType: "text",
    position: 10,
    width: 180,
    pinned: false,
    color: null,
    hidden: false,
    // Bewusst wie Vorname/Nachname/E-Mail konfiguriert: eine normale Daten-Spalte
    // ohne Provider und ohne KI-Prompt — dadurch ist ihr Spaltenmenü identisch
    // (sortieren, färben, ausblenden, manuell überschreiben) und der Prompt für
    // die Anrede bleibt fest im Code (salutation.ts). Kein `source`, der Wert
    // liegt also in customFields.cells["anrede"].
    config: {},
  },
  {
    key: EMAIL_FINDER_KEY,
    label: "Email_Entscheider",
    kind: "enrichment",
    dataType: "email",
    position: 11,
    width: 240,
    pinned: false,
    color: null,
    hidden: false,
    // Verifizierte Entscheider-E-Mail: testet Namens-Varianten (vorname.nachname@…)
    // per Reacher-SMTP-Check. Startet automatisch nach "Update cells" für alle
    // Zeilen mit Vorname + Nachname + Webseite (Engine in reacher.ts).
    config: {
      provider: ["reacher"],
      inputs: {
        Vorname: "contact.firstName",
        Nachname: "contact.lastName",
        Webseite: "company.customFields.websiteUri",
      },
      outputs: [{ field: "email", label: "E-Mail", type: "email" }],
      runSettings: { autoUpdate: false, onlyRunIf: "always" },
    },
  },
];

// Keine Standard-Filter mehr: Die früheren Tabs "Alle", "Angereichert",
// "Nicht gefunden" und "Push-bereit" wurden auf Wunsch entfernt. Nur noch
// selbst gespeicherte Views (getOrgViews) erscheinen als Tabs.
export const BUILTIN_VIEWS: LeadView[] = [];

// ----------------------------------------------------------------------------
// Seeding / Laden
// ----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToColumn(r: any): LeadColumn {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    kind: r.kind,
    dataType: r.dataType,
    position: r.position,
    width: r.width,
    pinned: r.pinned,
    color: r.color,
    hidden: r.hidden,
    config: (r.config ?? {}) as LeadColumnConfig,
  };
}

/**
 * Legt fehlende Default-Spalten an (idempotent über `key`, immer global —
 * `leadListId` NULL) und gibt die für den Ordner `listId` sichtbaren Spalten
 * zurück (global + nur diesem Ordner zugeordnete). Ohne `listId`: alle Spalten
 * der Org (z. B. für Schlüssel-Eindeutigkeit).
 */
export async function ensureDefaultColumns(
  orgId: string,
  listId?: string,
): Promise<LeadColumn[]> {
  const existing = await db
    .select()
    .from(leadColumns)
    .where(eq(leadColumns.orgId, orgId))
    .orderBy(asc(leadColumns.position));

  const existingKeys = new Set(existing.map((c) => c.key));
  const missing = DEFAULT_COLUMNS.filter((c) => !existingKeys.has(c.key));

  if (missing.length > 0) {
    // Bei bestehenden Orgs können neue Default-Spalten (z. B. Email_Entscheider)
    // mit den Positionen selbst angelegter Spalten kollidieren → hinten anhängen,
    // damit die Reihenfolge deterministisch bleibt. Frische Orgs (leer) behalten
    // die Seed-Positionen.
    const maxPos = existing.reduce((m, c) => Math.max(m, c.position), -1);
    await db.insert(leadColumns).values(
      missing.map((c, i) => ({
        orgId,
        // Standard-Spalten sind IMMER global (leadListId NULL) → in jedem Ordner.
        leadListId: null,
        key: c.key,
        label: c.label,
        kind: c.kind,
        dataType: c.dataType,
        position: existing.length === 0 ? c.position : maxPos + 1 + i,
        width: c.width,
        pinned: c.pinned,
        color: c.color,
        hidden: c.hidden,
        config: c.config,
      })),
    );
  }

  return getColumns(orgId, listId);
}

/**
 * Spalten der Org. Mit `listId`: nur die in diesem Ordner sichtbaren — globale
 * Spalten (leadListId NULL) plus die, die genau diesem Ordner zugeordnet sind.
 * Ohne `listId`: alle Spalten der Org (Schlüssel-Eindeutigkeit / Engine).
 */
export async function getColumns(
  orgId: string,
  listId?: string,
): Promise<LeadColumn[]> {
  const rows = await db
    .select()
    .from(leadColumns)
    .where(
      listId
        ? and(
            eq(leadColumns.orgId, orgId),
            or(
              isNull(leadColumns.leadListId),
              eq(leadColumns.leadListId, listId),
            ),
          )
        : eq(leadColumns.orgId, orgId),
    )
    .orderBy(asc(leadColumns.position));
  return rows.map(rowToColumn);
}

export async function getColumnByKey(
  orgId: string,
  key: string,
): Promise<LeadColumn | null> {
  const [row] = await db
    .select()
    .from(leadColumns)
    .where(and(eq(leadColumns.orgId, orgId), eq(leadColumns.key, key)))
    .limit(1);
  return row ? rowToColumn(row) : null;
}

// ----------------------------------------------------------------------------
// Zell-Adapter
// ----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export type RowSources = {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    companyId: string | null;
    customFields: AnyObj | null;
  };
  company: {
    name: string | null;
    domain: string | null;
    address: AnyObj | null;
    customFields: AnyObj | null;
  } | null;
};

/** Löst einen Pfad wie "company.customFields.rating" gegen die Row-Quellen auf. */
export function resolveRowPath(
  path: string | undefined,
  src: RowSources,
): unknown {
  if (!path) return null;
  const parts = path.split(".");
  let node: unknown = parts[0] === "company" ? src.company : src.contact;
  for (let i = 1; i < parts.length; i++) {
    if (node == null || typeof node !== "object") return null;
    node = (node as AnyObj)[parts[i]];
  }
  return node ?? null;
}

function toCellValue(v: unknown): LeadCell["value"] {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  return String(v);
}

function summarizePerson(raw: AnyObj | null): string {
  if (!raw) return "";
  const isNF = (x: unknown) =>
    !x || String(x).toUpperCase() === "NF" || String(x).trim() === "";
  const name = [raw.vorname, raw.nachname]
    .filter((x) => !isNF(x))
    .join(" ")
    .trim();
  if (name) return name;
  if (!isNF(raw.email)) return String(raw.email);
  return "";
}

/** Liest den Enrichment-Zellstatus — neues `cells`-Format ODER altes `enrichment`-Feld. */
function enrichmentCell(key: string, contactCf: AnyObj | null): LeadCell {
  const cells = contactCf?.cells as AnyObj | undefined;
  const cell = cells?.[key] as AnyObj | undefined;

  if (cell) {
    const raw = (cell.raw ?? null) as AnyObj | null;
    return {
      value: cell.value ?? summarizePerson(raw),
      status: (cell.status ?? "empty") as CellStatus,
      provider: cell.provider ?? null,
      runAt: cell.runAt ?? null,
      error: cell.error ?? null,
      raw,
      editable: false,
    };
  }

  // Legacy-Fallback (nur die ursprüngliche find_dm-Enrichment).
  if (key === ENRICHMENT_KEY) {
    const legacy = contactCf?.enrichment as string | undefined;
    if (legacy === "done")
      return { value: "", status: "success", raw: null, editable: false };
    if (legacy === "not_found")
      return { value: "", status: "not_found", raw: null, editable: false };
  }

  return { value: "", status: "empty", raw: null, editable: false };
}

/** Baut die Zell-Map einer Zeile für alle Spalten. */
export function buildCells(
  columns: LeadColumn[],
  src: RowSources,
): Record<string, LeadCell> {
  const cells: Record<string, LeadCell> = {};

  for (const col of columns) {
    if (col.kind === "enrichment" || col.kind === "action" || col.config.ai) {
      const base = enrichmentCell(col.key, src.contact.customFields);
      // Für find_dm: zeige den Personennamen auch wenn nur die Alt-Daten da sind.
      if (
        col.key === ENRICHMENT_KEY &&
        base.status === "success" &&
        !base.value
      ) {
        const name = [src.contact.firstName, src.contact.lastName]
          .filter(Boolean)
          .join(" ");
        base.value = name || src.contact.email || "";
        if (!base.raw)
          base.raw = {
            vorname: src.contact.firstName,
            nachname: src.contact.lastName,
            email: src.contact.email,
          };
      }
      // Enrichment-/KI-Zellen dürfen manuell korrigiert werden (wie normale
      // Zellen) — reine Aktions-Spalten (kind "action") jedoch nicht.
      base.editable = col.kind === "enrichment" || !!col.config.ai;
      cells[col.key] = base;
      continue;
    }

    // source / data
    let value: unknown;
    if (col.config.derivedFrom) {
      const parent = enrichmentCell(
        col.config.derivedFrom.column,
        src.contact.customFields,
      );
      value = parent.raw?.[col.config.derivedFrom.field] ?? null;
    } else if (col.config.source) {
      value = resolveRowPath(col.config.source, src);
    } else {
      // Manuelle Daten-Spalte (vom Nutzer angelegt) → Wert liegt in cells[key].
      const manual = (src.contact.customFields?.cells as AnyObj | undefined)?.[
        col.key
      ] as AnyObj | undefined;
      value = manual?.value ?? null;
    }

    const cv = toCellValue(value);
    cells[col.key] = {
      value: cv,
      status: cv === null || cv === "" ? "empty" : "success",
      editable: col.kind === "data" && !col.config.derivedFrom,
    };
  }

  return cells;
}

// ----------------------------------------------------------------------------
// Run-Logik-Helfer
// ----------------------------------------------------------------------------

/** "missing"-Modus: Zelle braucht einen Run, wenn leer oder Fehler. */
export function cellNeedsRun(cell: LeadCell): boolean {
  return cell.status === "empty" || cell.status === "error";
}

/** "Only run if": überspringt Zeilen, deren Bedingung nicht erfüllt ist. */
export function passesOnlyRunIf(
  onlyRunIf: OnlyRunIf | undefined,
  contact: RowSources["contact"],
): boolean {
  switch (onlyRunIf) {
    case "name_empty":
      return !contact.firstName && !contact.lastName;
    case "email_empty":
      return !contact.email;
    case "always":
    default:
      return true;
  }
}
