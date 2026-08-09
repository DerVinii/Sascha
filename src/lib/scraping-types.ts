/**
 * Geteilte Typen der Clay-artigen Lead-Table (Client + Server).
 * Bewusst frei von Server-Imports, damit Client-Komponenten sie nutzen können.
 */

/** Schlüssel der kanonischen Enrichment-Spalte (Geschäftsführer finden). */
export const ENRICHMENT_KEY = "find_dm";

/**
 * Schlüssel der Spalte "Email_Entscheider": findet die echte E-Mail-Adresse des
 * Entscheiders, indem Namens-Varianten (vorname.nachname@domain, …) per
 * Reacher-Server (Live-SMTP-Check) verifiziert werden. Läuft automatisch nach
 * dem "Update cells"-Workflow für alle Leads mit Vorname + Nachname + Webseite.
 */
export const EMAIL_FINDER_KEY = "email_entscheider";

/**
 * Schlüssel der Standard-Spalte "Anrede" ("Herr Aris"). Wird beim "Update cells"-
 * Lauf direkt nach Vorname/Nachname aus genau diesen beiden Feldern formuliert;
 * der Prompt dafür steht fest im Code (server/scraping/salutation.ts) und ist
 * bewusst nicht über die Oberfläche änderbar. Ansonsten verhält sich die Spalte
 * wie Vorname/Nachname/E-Mail: frei editierbar, aber nicht umbenenn-/löschbar.
 */
export const SALUTATION_KEY = "anrede";

/**
 * Schlüssel der System-Spalte "Pipeline-Phase". Diese Spalte existiert NICHT in
 * `lead_columns`, sondern wird beim Laden der Tabelle nur dann synthetisch
 * eingefügt, wenn der Ordner mit einer Pipeline verbunden ist. Sie ist
 * schreibgeschützt (nicht umbenennen/einfärben/ausblenden/löschen); die Zelle
 * öffnet stattdessen ein Phasen-Dropdown, das den Deal in der Pipeline verschiebt.
 */
export const PIPELINE_STAGE_KEY = "pipeline_stage";

export function isPipelineStageColumn(key: string): boolean {
  return key === PIPELINE_STAGE_KEY;
}

/**
 * Standard-Spalten, die von einer festen Engine gefüllt werden — Wert: der Key
 * der Spalte, die den Lauf ausführt. Vorname/Nachname/E-Mail kommen alle drei
 * aus der Geschäftsführer-Suche, die Anrede aus ihrem eigenen festen Prompt.
 *
 * Diese Spalten bekommen im Spaltenmenü "Fehlende ausführen" und "Alle
 * erzwingen" statt "Mit KI ausfüllen": Der Prompt steht fest, es gibt nichts
 * einzugeben.
 */
export const ENGINE_FILLED_COLUMNS: Record<string, string> = {
  firstName: ENRICHMENT_KEY,
  lastName: ENRICHMENT_KEY,
  email: ENRICHMENT_KEY,
  [SALUTATION_KEY]: SALUTATION_KEY,
};

/** Key der Spalte, die den Lauf für `key` ausführt (null = keine Engine). */
export function engineForColumn(key: string): string | null {
  return ENGINE_FILLED_COLUMNS[key] ?? null;
}

export function isEngineFilledColumn(key: string): boolean {
  return engineForColumn(key) !== null;
}

/**
 * Kern-Spalten mit festem Key, die nicht gelöscht werden dürfen — diese Felder
 * werden vom Enrichment zurückgeschrieben und in Instantly-Kampagnen gebraucht.
 */
export const PROTECTED_COLUMN_KEYS = ["firstName", "lastName", "email"] as const;

export function isProtectedColumn(key: string): boolean {
  return (PROTECTED_COLUMN_KEYS as readonly string[]).includes(key);
}

/**
 * Keys der geseedeten Standard-Spalten (siehe DEFAULT_COLUMNS). Diese sind NICHT
 * vom Nutzer selbst angelegt und dürfen daher nicht umbenannt oder gelöscht
 * werden — nur eingefärbt/aus- und eingeblendet.
 */
export const BUILTIN_COLUMN_KEYS = [
  "company",
  "address",
  "phone",
  "website",
  "rating",
  "gmaps",
  ENRICHMENT_KEY,
  "firstName",
  "lastName",
  "email",
  SALUTATION_KEY,
  EMAIL_FINDER_KEY,
] as const;

/**
 * true, wenn die Spalte vom Nutzer selbst angelegt wurde (also weder eine
 * Standard-Spalte noch die synthetische Pipeline-Phase/System-Spalte ist).
 * Nur solche Spalten dürfen umbenannt und gelöscht werden.
 */
export function isUserColumn(col: {
  key: string;
  config?: { system?: boolean };
}): boolean {
  if (isPipelineStageColumn(col.key)) return false;
  if (col.config?.system) return false;
  return !(BUILTIN_COLUMN_KEYS as readonly string[]).includes(col.key);
}

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
  /** System-Spalte (z. B. "Pipeline-Phase"): nicht bearbeit-/löschbar. */
  system?: boolean;
  /** Pipeline-Phase-Spalte: verbundene Pipeline + ihre Phasen (fürs Dropdown). */
  pipeline?: {
    pipelineId: string;
    stages: { id: string; name: string; color: string | null }[];
  };
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
  /** Roh-Farbe (Hex) der Zelle — genutzt von der "Pipeline-Phase"-Spalte
   *  (Phasenfarbe aus pipeline_stages.color). Nicht Teil des Token-Systems. */
  color?: string | null;
  /** ID der aktuell gewählten Pipeline-Phase (für das Dropdown der Phase-Zelle). */
  stageId?: string | null;
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
  | {
      mode: "missing" | "force";
      limit?: number;
      offset?: number;
      /** Zeilen, die in diesem Lauf schon versucht wurden — nicht erneut ziehen. */
      excludeRowIds?: string[];
    }; // Spalte / alle

export type RunBatchResult = {
  processed: number;
  succeeded: number;
  notFound: number;
  failed: number;
  remaining: number;
  /** betroffene Zeilen-IDs dieses Batches (für optimistische UI-Updates). */
  rowIds: string[];
  /** true, wenn eine Zeile am Gemini-Kontingent (429) scheiterte — Lauf stoppen. */
  rateLimited?: boolean;
  /** Gesetzt, wenn der Lauf an der Umgebung scheiterte (Prüfserver nicht
   *  erreichbar, Secret fehlt). Es wurde KEINE Zeile als Fehler markiert; der
   *  Client soll den Lauf stoppen und die Meldung anzeigen. */
  abortReason?: string | null;
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

/**
 * Welche Leads einer Liste in die Kampagne sollen. Die E-Mail-Regel ist fest:
 * verifizierte Entscheider-E-Mail (Spalte Email_Entscheider) gewinnt immer,
 * sonst die normale E-Mail; ohne beides wird der Lead übersprungen.
 */
export type InstantlySendFilter = {
  /** bereits an diese Kampagne gesendete Leads überspringen. */
  skipAlreadySent: boolean;
  /**
   * Duplikate aus ANDEREN Kampagnen überspringen (innerhalb derselben Kampagne
   * wird immer dedupliziert). false = Lead wird auch dann eingespielt, wenn er
   * schon in einer anderen Instantly-Kampagne existiert.
   */
  skipWorkspaceDuplicates: boolean;
};

/** Live-Zähler im Modal vor dem Versand. */
export type InstantlySendPreview = {
  total: number;
  /** Leads mit sendbarer Adresse (Entscheider-E-Mail ODER normale E-Mail). */
  withEmail: number;
  noEmail: number;
  /** Leads mit verifizierter Entscheider-E-Mail (Email_Entscheider). */
  withFinderEmail: number;
  alreadySent: number;
  /** Anzahl, die mit dem aktuellen Filter gesendet würde. */
  eligible: number;
};

/** Ergebnis eines Versand-Batches (Client schleift per offset bis remaining=0). */
export type InstantlySendResult = {
  processed: number;
  sent: number;
  /** bereits vorhandene Leads, deren Spalten/Variablen aufgefrischt wurden. */
  updated: number;
  skippedNoEmail: number;
  skippedAlreadySent: number;
  /** übersprungen, weil bereits in einer anderen Kampagne vorhanden (Duplikat). */
  skippedDuplicate: number;
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

/** Gespeicherter Satz Kampagnen-Texte, in jedem Ordner wiederverwendbar. */
export type CampaignTemplate = {
  id: string;
  name: string;
  steps: CampaignStep[];
  /** ISO-Zeitpunkt der letzten Speicherung — im Menü als Datum sichtbar. */
  updatedAt: string;
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

/**
 * Default-Spalten → Instantly-Template-Token. WICHTIG: Instantly nutzt in der
 * Sequenz camelCase-Variablen ({{firstName}}, {{lastName}}, {{companyName}}) —
 * NICHT snake_case. Wird hier falsch gemappt, steht in der Mail z. B. {{first_name}},
 * was Instantly nicht auflöst (die Lead-Variable heißt firstName). Verifiziert
 * gegen die echte API/CLI.
 */
export const NATIVE_INSTANTLY_TOKENS: Record<string, string> = {
  company: "companyName",
  firstName: "firstName",
  lastName: "lastName",
  email: "email",
  phone: "phone",
  website: "website",
};

/** Variablen-Token (für {{…}}) zu einer Spalte. Native Felder werden auf den
 *  camelCase-Token gemappt, alle übrigen Spalten laufen als custom_variables
 *  unter ihrem Spalten-Key. */
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
  /** Verbundene Pipeline (null = nicht verbunden) — steuert Button-Zustand
   *  & Anzeige der "Pipeline-Phase"-Spalte. */
  linkedPipeline: { id: string; name: string } | null;
  /** true, sobald für diesen Ordner eine Instantly-Kampagne angelegt wurde
   *  ("Kampagne einrichten" → "Kampagne bearbeiten"). */
  hasCampaign: boolean;
};
