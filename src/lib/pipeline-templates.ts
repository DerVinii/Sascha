/**
 * Geteilte Konstanten & Helfer für das Deal-/Pipeline-Modul.
 *
 * Liegt bewusst NICHT in einem "use server"-File, damit sowohl Server-Actions
 * als auch Client-Komponenten importieren können.
 */

export type StageTemplate = { name: string; color: string };

/**
 * Standard-Phasen für JEDE neue Pipeline (an SalesSuite angelehnt).
 * Es gibt bewusst keine Vorlagen-Auswahl mehr — beim Anlegen wird nur der Name
 * abgefragt und immer dieser Standard-Satz an Phasen verwendet.
 */
export const DEFAULT_STAGES: StageTemplate[] = [
  { name: "Lead", color: "#fef3c7" },
  { name: "Qualifiziert", color: "#dbeafe" },
  { name: "Im Gespräch", color: "#e0e7ff" },
  { name: "Termin gebucht", color: "#fed7aa" },
  { name: "Gewonnen", color: "#d1fae5" },
  { name: "Verloren", color: "#fee2e2" },
];

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
