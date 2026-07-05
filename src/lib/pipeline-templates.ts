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
  { name: "gescrapt", color: "#f1f5f9" },
  { name: "in Kampagne", color: "#fef3c7" },
  { name: "angeschrieben", color: "#dbeafe" },
  { name: "Kampagne fertig", color: "#e0e7ff" },
  { name: "geantwortet", color: "#fed7aa" },
  { name: "Termin vereinbart", color: "#fde68a" },
  { name: "Deal", color: "#d1fae5" },
  { name: "Lost", color: "#fee2e2" },
];

/**
 * Farbpalette für die Phasen-Auswahl (Pipeline-Manager) und Tag-Farben.
 *
 * Zwei Reihen à 16 Farben in gleicher Farbton-Reihenfolge:
 *  - „kräftig" (klassische, satte Farben) — obere zwei Zeilen
 *  - „hell" (dieselben Farbtöne als Pastell) — untere zwei Zeilen
 * Die Schriftfarbe auf einer Phase/Tag wird per readableTextColor() automatisch
 * dunkel oder weiß gewählt, damit auch kräftige Farben gut lesbar bleiben.
 */
export const STAGE_COLORS = [
  // ── kräftig (klassische Farben) ──────────────────────────────────────────
  "#ef4444", // Rot
  "#f97316", // Orange
  "#f59e0b", // Bernstein
  "#eab308", // Gelb
  "#84cc16", // Limette
  "#22c55e", // Grün
  "#14b8a6", // Türkis
  "#06b6d4", // Cyan
  "#3b82f6", // Blau
  "#6366f1", // Indigo
  "#8b5cf6", // Violett
  "#a855f7", // Lila
  "#d946ef", // Magenta
  "#ec4899", // Pink
  "#64748b", // Grau
  "#334155", // Anthrazit
  // ── hell (dieselben Farbtöne als Pastell) ────────────────────────────────
  "#fecaca", // Rot
  "#fed7aa", // Orange
  "#fde68a", // Bernstein
  "#fef08a", // Gelb
  "#d9f99d", // Limette
  "#bbf7d0", // Grün
  "#99f6e4", // Türkis
  "#a5f3fc", // Cyan
  "#bfdbfe", // Blau
  "#c7d2fe", // Indigo
  "#ddd6fe", // Violett
  "#e9d5ff", // Lila
  "#f5d0fe", // Magenta
  "#fbcfe8", // Pink
  "#e2e8f0", // Grau
  "#f8fafc", // Weiß
];

/**
 * Wählt eine gut lesbare Schriftfarbe (dunkel oder weiß) für einen beliebigen
 * Hintergrund. Nutzt die wahrgenommene Helligkeit (YIQ): helle Flächen → dunkle
 * Schrift, dunkle/satte Flächen → weiße Schrift. Fällt bei ungültigem Wert auf
 * dunkle Schrift zurück.
 */
export function readableTextColor(bg: string | null | undefined): string {
  const DARK = "#0f172a";
  const LIGHT = "#ffffff";
  if (!bg) return DARK;
  const raw = bg.trim().replace(/^#/, "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return DARK;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Wahrgenommene Helligkeit 0–255 (YIQ-Gewichtung).
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 140 ? DARK : LIGHT;
}

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
