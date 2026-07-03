/**
 * Individuelle Kontaktfelder (Custom Fields).
 *
 * Felddefinitionen leben in organizations.settings.contactFields (Array),
 * die Werte pro Kontakt in contacts.custom_fields unter dem Namespace
 * "fields" — getrennt von den reservierten Scraping-Namespaces
 * (cells/enrichment/instantly). Diese Datei ist bewusst ohne "use server",
 * damit Server-Actions UND Client-Komponenten sie importieren können.
 */

export const CONTACT_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Zahl" },
  { value: "date", label: "Datum" },
  { value: "select", label: "Auswahl" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "phone", label: "Telefon" },
] as const;

export type ContactFieldType = (typeof CONTACT_FIELD_TYPES)[number]["value"];

export type ContactFieldDef = {
  key: string;
  label: string;
  type: ContactFieldType;
  /** Nur bei type "select". */
  options?: string[];
  /** Als Spalte in der Kontakte-Tabelle anzeigen. */
  showInTable: boolean;
};

export type ContactFieldValue = string | number | boolean | null;

const VALID_TYPES = new Set<string>(CONTACT_FIELD_TYPES.map((t) => t.value));

export function fieldTypeLabel(type: ContactFieldType): string {
  return CONTACT_FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Defensive: settings.contactFields kann fehlen oder beschädigt sein. */
export function parseContactFieldDefs(settings: unknown): ContactFieldDef[] {
  const raw = (settings as { contactFields?: unknown } | null | undefined)
    ?.contactFields;
  if (!Array.isArray(raw)) return [];
  const defs: ContactFieldDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.key !== "string" || !f.key || seen.has(f.key)) continue;
    if (typeof f.label !== "string" || !f.label) continue;
    if (typeof f.type !== "string" || !VALID_TYPES.has(f.type)) continue;
    seen.add(f.key);
    defs.push({
      key: f.key,
      label: f.label,
      type: f.type as ContactFieldType,
      options: Array.isArray(f.options)
        ? f.options.filter((o): o is string => typeof o === "string")
        : undefined,
      showInTable: f.showInTable === true,
    });
  }
  return defs;
}

/** Liest die Custom-Field-Werte eines Kontakts aus custom_fields.fields. */
export function parseContactFieldValues(
  customFields: unknown,
): Record<string, ContactFieldValue> {
  const raw = (customFields as { fields?: unknown } | null | undefined)?.fields;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ContactFieldValue> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
    }
  }
  return out;
}

/** Stabiler Key aus dem Label (Umlaute transkribiert), eindeutig gegen bestehende Keys. */
export function slugifyFieldKey(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "feld";
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** Anzeige-Format für ein Datum im Wert-Format YYYY-MM-DD. */
export function formatFieldDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
