/**
 * Client-sichere Typen, Label-Maps und Formatter für den Statistik-Reiter.
 * Keine Server-Importe — wird von der Client-Dashboard-Komponente mitgeladen.
 * Datenquelle sind die Instantly-Kampagnen-Analytics (siehe
 * src/lib/server/instantly/client.ts), hier nur als serialisierte Rohwerte.
 */

export type Range = "7d" | "30d" | "90d" | "all";

/** Workspace-Aggregat für die KPI-Karten + den Trichter. */
export type StatOverview = {
  emailsSent: number;
  contacted: number;
  openUnique: number;
  linkClickUnique: number;
  replyUnique: number;
  bounced: number;
  unsubscribed: number;
  opportunities: number;
  opportunityValue: number;
  interested: number;
  meetingBooked: number;
  meetingCompleted: number;
  closed: number;
};

/** Ein dichter (lückenloser) Tag im Verlaufs-Chart. */
export type DailyPoint = {
  date: string; // ISO yyyy-mm-dd
  sent: number;
  opened: number;
  uniqueOpened: number;
  replies: number;
  uniqueReplies: number;
  clicks: number;
  uniqueClicks: number;
};

/** Eine Zeile der Kampagnen-Tabelle (Liste ⋃ Analytics gemerged). */
export type CampaignRow = {
  id: string;
  name: string;
  status: number | null;
  isEvergreen: boolean;
  contacted: number;
  emailsSent: number;
  openCount: number;
  replyCount: number;
  bounced: number;
  opportunities: number;
  opportunityValue: number;
};

export type Tone = "ok" | "warn" | "err" | "muted" | "info";

/** Instantly-Kampagnen-Status → deutsches Label + Farbton. */
export const CAMPAIGN_STATUS: Record<number, { label: string; tone: Tone }> = {
  0: { label: "Entwurf", tone: "muted" },
  1: { label: "Aktiv", tone: "ok" },
  2: { label: "Pausiert", tone: "warn" },
  3: { label: "Abgeschlossen", tone: "ok" },
  4: { label: "Folgesequenzen", tone: "info" },
  [-1]: { label: "Konten-Fehler", tone: "err" },
  [-2]: { label: "Bounce-Schutz", tone: "warn" },
  [-99]: { label: "Konto gesperrt", tone: "err" },
};

export function campaignStatusBadge(status: number | null): {
  label: string;
  tone: Tone;
} {
  if (status == null || !(status in CAMPAIGN_STATUS)) {
    return { label: "Unbekannt", tone: "muted" };
  }
  return CAMPAIGN_STATUS[status];
}

// --- Formatter ---------------------------------------------------------------

const nfInt = new Intl.NumberFormat("de-DE");
const nfCompact = new Intl.NumberFormat("de-DE", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const nfEur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Ganzzahl mit Tausenderpunkt: 9800 → „9.800". */
export function fmtInt(n: number): string {
  return nfInt.format(Math.round(n));
}

/** Kompakt ab 1000: 9800 → „9,8 Tsd.", darunter voll. */
export function fmtCompact(n: number): string {
  return Math.abs(n) < 1000 ? nfInt.format(Math.round(n)) : nfCompact.format(n);
}

export function fmtEur(n: number): string {
  return nfEur.format(n);
}

/** Rate in % oder null, wenn kein Nenner. */
export function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/** „2,82 %" bzw. „–" wenn null. */
export function fmtPct(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return (
    new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v) + " %"
  );
}

/** ISO-Tag → „01. Okt" (UTC-fest, damit kein Zeitzonen-Versatz entsteht). */
export function fmtDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** ISO-Tag → „01. Okt 2026" (für die Zeitraum-Fußnote). */
export function fmtDayLabelYear(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "7d", label: "7 T" },
  { value: "30d", label: "30 T" },
  { value: "90d", label: "90 T" },
  { value: "all", label: "Gesamt" },
];
