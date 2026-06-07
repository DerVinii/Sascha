/**
 * Geteilte Typen der Clay-artigen Lead-Table (Client + Server).
 * Bewusst frei von Server-Imports, damit Client-Komponenten sie nutzen können.
 */

/** Schlüssel der kanonischen Enrichment-Spalte (Geschäftsführer finden). */
export const ENRICHMENT_KEY = "find_dm";

export type LeadColumnKind = "source" | "data" | "enrichment" | "action";

export type LeadDataType =
  | "text"
  | "email"
  | "url"
  | "number"
  | "checkbox"
  | "select"
  | "rating";

export type CellStatus =
  | "empty"
  | "queued"
  | "running"
  | "success"
  | "not_found"
  | "error";

export type OnlyRunIf = "always" | "name_empty" | "email_empty";

export type LeadColumnConfig = {
  /** enrichment: Provider-Kette (Waterfall). Aktuell nur ["gemini"]. */
  provider?: string[];
  /** enrichment: Input-Mapping (Anzeigename -> Source-Pfad), z. B. {Firmenname: "company.name"}. */
  inputs?: Record<string, string>;
  /** enrichment: welche Felder der Provider liefert. */
  outputs?: { field: string; label: string; type: LeadDataType }[];
  runSettings?: { autoUpdate?: boolean; onlyRunIf?: OnlyRunIf };
  /** data: abgeleitet aus einem Enrichment-Output (Clay "Add as column"). */
  derivedFrom?: { column: string; field: string };
  /** source/data: Pfad auf den Rohwert, z. B. "company.name" | "contact.email". */
  source?: string;
  /** select: Optionen. */
  options?: string[];
  /** "Mit KI ausfüllen" (Claygent): freier Prompt, pro Zeile von Gemini ausgeführt. */
  ai?: { prompt: string };
};

export type LeadColumn = {
  id: string;
  key: string;
  label: string;
  kind: LeadColumnKind;
  dataType: LeadDataType;
  position: number;
  width: number;
  pinned: boolean;
  color: string | null;
  hidden: boolean;
  config: LeadColumnConfig;
};

export type LeadCell = {
  value: string | number | boolean | null;
  status: CellStatus;
  provider?: string | null;
  runAt?: string | null;
  error?: string | null;
  /** strukturiertes Ergebnis (für den Cell-Details-Drawer). */
  raw?: Record<string, unknown> | null;
  editable?: boolean;
};

export type LeadRow = {
  id: string; // contact id
  companyId: string | null;
  cells: Record<string, LeadCell>; // keyed by column.key
};

export type FilterOp =
  | "is_empty"
  | "not_empty"
  | "contains"
  | "equals"
  | "status_is";

export type LeadViewFilter = {
  columnKey: string;
  op: FilterOp;
  value?: string;
};

export type LeadView = {
  id: string;
  name: string;
  filters: LeadViewFilter[];
  builtin?: boolean;
};

/** Ausführungs-Scope für einen Enrichment-Run. */
export type RunScope =
  | { rowIds: string[] } // einzelne Zelle / Auswahl
  | { mode: "missing" | "force"; limit?: number; offset?: number }; // Spalte / alle

export type RunBatchResult = {
  processed: number;
  succeeded: number;
  notFound: number;
  failed: number;
  remaining: number;
  /** betroffene Zeilen-IDs dieses Batches (für optimistische UI-Updates). */
  rowIds: string[];
};

export type LeadTableData = {
  columns: LeadColumn[];
  rows: LeadRow[];
  total: number;
  views: LeadView[];
};
