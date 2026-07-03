/**
 * Geteilte Typen, Farb-Metadaten und Datums-Helfer für den Kalender-Reiter.
 * Bewusst frei von Server-Importen — läuft in Server- UND Client-Komponenten.
 * Die Tages-Zuordnung passiert überall in lokaler Zeit (Browser = Europe/Berlin).
 */

export type CalendarEventType =
  | "meeting"
  | "call"
  | "task"
  | "reminder"
  | "other";

/** Vereinheitlichtes Kalender-Element — eigenständiger Termin ODER CRM-Aktivität. */
export type CalendarItem = {
  id: string;
  /** "event" = editierbarer Termin, "activity" = read-only CRM-Aufgabe. */
  source: "event" | "activity";
  title: string;
  type: CalendarEventType;
  /** ISO-8601 (UTC). Im Client via new Date() → lokale Zeit. */
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  contactId: string | null;
  contactName: string | null;
};

export type Tone = "accent" | "ok" | "warn" | "info" | "sub" | "err";

/** Statische (Tailwind-scannbare) Klassen je Farbton. */
export const TONE_CLASSES: Record<
  Tone,
  { dot: string; chipBg: string; chipText: string; bar: string }
> = {
  accent: {
    dot: "bg-accent",
    chipBg: "bg-accent-faint",
    chipText: "text-accent-ink",
    bar: "bg-accent",
  },
  ok: { dot: "bg-ok", chipBg: "bg-ok/10", chipText: "text-ok", bar: "bg-ok" },
  warn: {
    dot: "bg-warn",
    chipBg: "bg-warn/10",
    chipText: "text-warn",
    bar: "bg-warn",
  },
  info: {
    dot: "bg-info",
    chipBg: "bg-info/10",
    chipText: "text-info",
    bar: "bg-info",
  },
  err: {
    dot: "bg-err",
    chipBg: "bg-err/10",
    chipText: "text-err",
    bar: "bg-err",
  },
  sub: {
    dot: "bg-sub",
    chipBg: "bg-bg",
    chipText: "text-sub",
    bar: "bg-sub",
  },
};

export const EVENT_TYPE_META: Record<
  CalendarEventType,
  { label: string; tone: Tone }
> = {
  meeting: { label: "Meeting", tone: "accent" },
  call: { label: "Telefonat", tone: "ok" },
  task: { label: "Aufgabe", tone: "warn" },
  reminder: { label: "Erinnerung", tone: "info" },
  other: { label: "Sonstiges", tone: "sub" },
};

/** Reihenfolge für das Typ-Auswahlmenü / Filter. */
export const EVENT_TYPE_ORDER: CalendarEventType[] = [
  "meeting",
  "call",
  "task",
  "reminder",
  "other",
];

export function itemTone(item: CalendarItem): Tone {
  // CRM-Aktivitäten immer in Rosé, damit sie sich von Terminen abheben.
  if (item.source === "activity") return "err";
  return EVENT_TYPE_META[item.type].tone;
}

export function itemLabel(item: CalendarItem): string {
  if (item.source === "activity") return "Aufgabe (CRM)";
  return EVENT_TYPE_META[item.type].label;
}

// ---------------------------------------------------------------------------
// Datums-Helfer (lokale Zeit)
// ---------------------------------------------------------------------------

const WEEKDAYS_SHORT = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
export function weekdayHeaders(): string[] {
  return WEEKDAYS_SHORT;
}

/** Montag=0 … Sonntag=6 (statt JS-Standard Sonntag=0). */
export function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Stabiler Tagesschlüssel in lokaler Zeit: "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" → {year, month(0-based)}; ungültig/leer → aktueller Monat. */
export function parseMonthParam(param: string | undefined, today: Date) {
  if (param) {
    const m = /^(\d{4})-(\d{2})$/.exec(param);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (month >= 0 && month <= 11) return { year, month };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() };
}

export function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 42 Tage (6 Wochen) für das Monatsraster, Montag-zuerst. Enthält je nach
 * Monat führende/nachlaufende Tage der Nachbarmonate.
 */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const lead = isoWeekday(first);
  const startDate = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i),
  );
}

/** Die 7 Tage der Woche (Montag-zuerst), die `d` enthält. */
export function weekDays(d: Date): Date[] {
  const monday = addDays(startOfDay(d), -isoWeekday(d));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const fmtTimeDE = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});
export function fmtTime(iso: string): string {
  return fmtTimeDE.format(new Date(iso));
}

const fmtMonthYearDE = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});
export function fmtMonthYear(d: Date): string {
  return fmtMonthYearDE.format(d);
}

const fmtDayLongDE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
export function fmtDayLong(d: Date): string {
  return fmtDayLongDE.format(d);
}

const fmtWeekdayShortDE = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
export function fmtWeekdayShort(d: Date): string {
  return fmtWeekdayShortDE.format(d);
}
