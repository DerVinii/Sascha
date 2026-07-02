/**
 * Geteilte Konstanten & Helfer für das Deal-/Pipeline-Modul.
 *
 * Liegt bewusst NICHT in einem "use server"-File, damit sowohl Server-Actions
 * als auch Client-Komponenten importieren können.
 */

export type StageTemplate = { name: string; probability: number; color: string };

/** Standard-Phasen für eine neue Pipeline (an SalesSuite angelehnt). */
export const DEFAULT_STAGES: StageTemplate[] = [
  { name: "Lead", probability: 10, color: "#fef3c7" },
  { name: "Qualifiziert", probability: 25, color: "#dbeafe" },
  { name: "Im Gespräch", probability: 40, color: "#e0e7ff" },
  { name: "Termin gebucht", probability: 60, color: "#fed7aa" },
  { name: "Gewonnen", probability: 100, color: "#d1fae5" },
  { name: "Verloren", probability: 0, color: "#fee2e2" },
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
      { name: "Recherchierte Leads", probability: 5, color: "#f1f5f9" },
      { name: "Geprüfte Leads", probability: 10, color: "#fef3c7" },
      { name: "DMC versendet", probability: 20, color: "#dbeafe" },
      { name: "Follow-up", probability: 35, color: "#e0e7ff" },
      { name: "Termin vereinbart", probability: 60, color: "#fed7aa" },
      { name: "Ungeeignet", probability: 0, color: "#fee2e2" },
    ],
  },
  setter_closer: {
    label: "Setter-Closer",
    description: "Warme Leads vom Anfrageeingang bis zum Abschluss.",
    stages: [
      { name: "Anfrage eingegangen", probability: 15, color: "#fef3c7" },
      { name: "Nachverfolgung", probability: 25, color: "#dbeafe" },
      { name: "Qualifiziert", probability: 40, color: "#e0e7ff" },
      { name: "Erstgespräch", probability: 55, color: "#fed7aa" },
      { name: "Folgegespräch", probability: 70, color: "#fde68a" },
      { name: "Verkauft", probability: 100, color: "#d1fae5" },
      { name: "Nicht verkauft", probability: 0, color: "#fee2e2" },
    ],
  },
  upsell: {
    label: "Upsell (Bestandskunden)",
    description: "Bestehende Kunden weiterentwickeln.",
    stages: [
      { name: "Bestandskunde", probability: 20, color: "#fef3c7" },
      { name: "Angebot", probability: 45, color: "#dbeafe" },
      { name: "Verhandlung", probability: 70, color: "#fed7aa" },
      { name: "Gewonnen", probability: 100, color: "#d1fae5" },
      { name: "Verloren", probability: 0, color: "#fee2e2" },
    ],
  },
  blank: {
    label: "Leer (eigene Phasen)",
    description: "Eine Phase zum Start — Rest selbst anlegen.",
    stages: [{ name: "Neu", probability: 0, color: "#e0e7ff" }],
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
