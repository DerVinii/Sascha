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

export type LeadList = {
  id: string;
  name: string;
  count: number;
  createdAt?: string | null;
};

// --- Instantly (Phase 2: Liste → Kampagne) ---------------------------------

/** Eine Instantly-Kampagne (für das Auswahl-Dropdown). */
export type InstantlyCampaign = {
  id: string;
  name: string;
  /** Instantly-Status-Code (0=Entwurf,1=aktiv,2=pausiert,3=fertig …) oder null. */
  status: number | null;
};

/** Welche Leads einer Liste in die Kampagne sollen. E-Mail ist immer Pflicht. */
export type InstantlySendFilter = {
  /** nur Leads mit erfolgreichem Enrichment (Geschäftsführer gefunden). */
  onlyEnriched: boolean;
  /** bereits an diese Kampagne gesendete Leads überspringen. */
  skipAlreadySent: boolean;
};

/** Live-Zähler im Modal vor dem Versand. */
export type InstantlySendPreview = {
  total: number;
  withEmail: number;
  noEmail: number;
  enriched: number;
  alreadySent: number;
  /** Anzahl, die mit dem aktuellen Filter gesendet würde. */
  eligible: number;
};

/** Ergebnis eines Versand-Batches (Client schleift per offset bis remaining=0). */
export type InstantlySendResult = {
  processed: number;
  sent: number;
  skippedNoEmail: number;
  skippedNotEnriched: number;
  skippedAlreadySent: number;
  failed: number;
  remaining: number;
  error?: string | null;
};

/** Ein Schritt der E-Mail-Sequenz. Schritt 0 = erste Mail, weitere = Follow-ups. */
export type CampaignStep = {
  subject: string;
  body: string;
  /** Tage Verzögerung vor diesem Schritt (erste Mail = 0; Follow-up = N Tage). */
  delayDays: number;
};

export type CampaignSenderAccount = {
  email: string;
  active: boolean;
  warmupScore: number | null;
};

/** Vorbefüllung für den „Kampagne einrichten"-Assistenten (pro Liste/Kampagne). */
export type CampaignSetupInfo = {
  /** verknüpfte Instantly-Kampagne (null = noch nicht eingerichtet). */
  campaignId: string | null;
  status: number | null;
  /** bestehende Copy (falls schon eingerichtet), sonst ein leerer Schritt. */
  steps: CampaignStep[];
  accounts: CampaignSenderAccount[];
  preview: InstantlySendPreview;
};

export type SaveCampaignResult = {
  campaignId: string | null;
  activated: boolean;
  error?: string | null;
};

/** Default-Spalten, die auf native Instantly-Lead-Felder mappen. */
export const NATIVE_INSTANTLY_TOKENS: Record<string, string> = {
  company: "company_name",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  website: "website",
};

/** Variablen-Token (für {{…}}) zu einer Spalte. Native Felder werden gemappt,
 *  alle übrigen Spalten laufen als custom_variables unter ihrem Spalten-Key. */
export function instantlyVarToken(columnKey: string): string {
  return NATIVE_INSTANTLY_TOKENS[columnKey] ?? columnKey;
}

export type LeadTableData = {
  columns: LeadColumn[];
  rows: LeadRow[];
  total: number;
  views: LeadView[];
  listId: string;
  listName: string;
};
