/**
 * Geteilte Konstanten & Helfer für das Deal-/Pipeline-Modul.
 *
 * Liegt bewusst NICHT in einem "use server"-File, damit sowohl Server-Actions
 * als auch Client-Komponenten importieren können.
 */

export type StageTemplate = { name: string; color: string };

/** Standard-Phasen für eine neue Pipeline (an SalesSuite angelehnt). */
export const DEFAULT_STAGES: StageTemplate[] = [
  { name: "Lead", color: "#fef3c7" },
  { name: "Qualifiziert", color: "#dbeafe" },
  { name: "Im Gespräch", color: "#e0e7ff" },
  { name: "Termin gebucht", color: "#fed7aa" },
  { name: "Gewonnen", color: "#d1fae5" },
  { name: "Verloren", color: "#fee2e2" },
];

/**
 * Vordefinierte Pipeline-Vorlagen — direkt aus dem SalesSuite-Funktionsumfang
 * (Setter-Closer-Prinzip). Werden beim Anlegen einer neuen Pipeline gewählt.
 */
export const PIPELINE_TEMPLATES: Record<
  string,
  { label: string; description: string; stages: StageTemplate[] }
> = {
  standard: {
    label: "Standard",
    description: "Klassische Vertriebs-Pipeline von Lead bis Abschluss.",
    stages: DEFAULT_STAGES,
  },
  cold_calling: {
    label: "Kaltakquise (Cold Calling)",
    description: "Opener-Pipeline für kalte Leads (DMC) von Recherche bis Termin.",
    stages: [
      { name: "Recherchierte Leads", color: "#f1f5f9" },
      { name: "Geprüfte Leads", color: "#fef3c7" },
      { name: "DMC versendet", color: "#dbeafe" },
      { name: "Follow-up", color: "#e0e7ff" },
      { name: "Termin vereinbart", color: "#fed7aa" },
      { name: "Ungeeignet", color: "#fee2e2" },
    ],
  },
  setter_closer: {
    label: "Setter-Closer",
    description: "Warme Leads vom Anfrageeingang bis zum Abschluss.",
    stages: [
      { name: "Anfrage eingegangen", color: "#fef3c7" },
      { name: "Nachverfolgung", color: "#dbeafe" },
      { name: "Qualifiziert", color: "#e0e7ff" },
      { name: "Erstgespräch", color: "#fed7aa" },
      { name: "Folgegespräch", color: "#fde68a" },
      { name: "Verkauft", color: "#d1fae5" },
      { name: "Nicht verkauft", color: "#fee2e2" },
    ],
  },
  upsell: {
    label: "Upsell (Bestandskunden)",
    description: "Bestehende Kunden weiterentwickeln.",
    stages: [
      { name: "Bestandskunde", color: "#fef3c7" },
      { name: "Angebot", color: "#dbeafe" },
      { name: "Verhandlung", color: "#fed7aa" },
      { name: "Gewonnen", color: "#d1fae5" },
      { name: "Verloren", color: "#fee2e2" },
    ],
  },
  blank: {
    label: "Leer (eigene Phasen)",
    description: "Eine Phase zum Start — Rest selbst anlegen.",
    stages: [{ name: "Neu", color: "#e0e7ff" }],
  },
};

export type PipelineTemplateKey = keyof typeof PIPELINE_TEMPLATES;

/** Farbpalette für die Phasen-Auswahl im Pipeline-Manager. */
export const STAGE_COLORS = [
  "#f1f5f9",
  "#fef3c7",
  "#fde68a",
  "#dbeafe",
  "#e0e7ff",
  "#fed7aa",
  "#d1fae5",
  "#fee2e2",
  "#fce7f3",
  "#ede9fe",
];

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Formatiert einen Euro-Betrag (ganzzahlig) oder "—" bei leer. */
export function formatEur(v: number | null | undefined): string {
  if (v == null) return "—";
  return EUR.format(v);
}
