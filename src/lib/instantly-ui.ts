/**
 * Client-sichere Typen & Label-Maps für den Postfach-Reiter (Instantly).
 * Keine Server-Imports — wird von Client-Komponenten mitgeladen.
 */

/** Serialisierte Zeile aus instantly_emails für die Unibox-UI. */
export type UniboxMessage = {
  id: string;
  threadId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  eaccount: string | null;
  leadEmail: string | null;
  direction: "in" | "out";
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  contentPreview: string | null;
  isUnread: boolean;
  iStatus: number | null;
  timestampEmail: string; // ISO
  contactId: string | null;
  contactName: string | null;
};

/** Account-Zeile fürs Sending-Accounts-Dashboard (serverseitig aggregiert). */
export type AccountRow = {
  email: string;
  name: string | null;
  status: number | null;
  statusMessage: string | null;
  warmupStatus: number | null;
  healthScore: number | null;
  dailyLimit: number | null;
  providerCode: number | null;
  warmupSent: number;
  warmupInbox: number;
  warmupSpam: number;
  /** Kampagnen-Versand von heute (Berliner Datum, kein Warmup). */
  sentToday: number;
  sent7: number;
  replies7: number;
  bounced7: number;
  sent30: number;
  replies30: number;
  bounced30: number;
  lastUsed: string | null;
  /** Letzte 7 Warmup-Tage, aufsteigend. */
  last7: { date: string; sent: number; landedInbox: number; landedSpam: number }[];
};

export const ACCOUNT_STATUS: Record<number, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  1: { label: "Aktiv", tone: "ok" },
  2: { label: "Pausiert", tone: "muted" },
  3: { label: "Wartung", tone: "warn" },
  [-1]: { label: "Verbindungsfehler", tone: "err" },
  [-2]: { label: "Soft-Bounce-Fehler", tone: "err" },
  [-3]: { label: "Sendefehler", tone: "err" },
};

export const WARMUP_STATUS: Record<number, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  1: { label: "Warmup aktiv", tone: "ok" },
  0: { label: "Warmup pausiert", tone: "muted" },
  [-1]: { label: "Gesperrt", tone: "err" },
  [-2]: { label: "Spam-Ordner", tone: "err" },
  [-3]: { label: "Suspendiert", tone: "err" },
};

export const PROVIDER_LABEL: Record<number, string> = {
  1: "IMAP/SMTP",
  2: "Google",
  3: "Microsoft",
  4: "AWS",
  8: "AirMail",
};

/** Lead-Interest-Stufen (Instantly lt_interest_status). */
export const INTEREST_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Lead (neutral)" },
  { value: 1, label: "Interessiert" },
  { value: 2, label: "Meeting gebucht" },
  { value: 3, label: "Meeting stattgefunden" },
  { value: 4, label: "Gewonnen" },
  { value: 0, label: "Out of Office" },
  { value: -1, label: "Nicht interessiert" },
  { value: -2, label: "Falsche Person" },
  { value: -3, label: "Verloren" },
];

export function interestLabel(v: number | null): string {
  return (
    INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? "Lead (neutral)"
  );
}
