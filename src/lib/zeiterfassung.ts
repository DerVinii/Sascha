/**
 * Zeit-Helfer für die Zeiterfassung.
 *
 * Alles rechnet fest in Europa/Berlin — der Server läuft auf Vercel in UTC,
 * die Stempelzeiten sind aber immer aus Sicht des Mitarbeiters zu bewerten.
 * Deshalb wird hier NICHT `src/lib/kalender.ts` benutzt (das rechnet in der
 * lokalen Zone des ausführenden Prozesses).
 *
 * Die Datei ist frei von Server-Imports und damit auch in Client-Komponenten
 * verwendbar.
 */
import { parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { de } from "date-fns/locale";

export const TZ = "Europe/Berlin";

// ============================================================================
// FORMATIERUNG
// ============================================================================

export function formatDateTime(d: Date | string, fmt = "dd.MM.yyyy HH:mm") {
  const date = typeof d === "string" ? parseISO(d) : d;
  return formatInTimeZone(date, TZ, fmt, { locale: de });
}

export function formatTime(d: Date | string) {
  return formatDateTime(d, "HH:mm");
}

export function formatDate(d: Date | string) {
  return formatDateTime(d, "dd.MM.yyyy");
}

export function formatWeekday(d: Date | string) {
  return formatDateTime(d, "EEEE");
}

export function formatMonthYear(d: Date) {
  return formatInTimeZone(d, TZ, "LLLL yyyy", { locale: de });
}

/** Minuten als "7:45 h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")} h`;
}

export function durationMinutes(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? parseISO(from) : from;
  const b = typeof to === "string" ? parseISO(to) : to;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

// ============================================================================
// BERLIN-ZEIT ↔ UTC
// ============================================================================

/**
 * Wandelt ein "naives" Berlin-Local-Datetime (YYYY-MM-DDTHH:mm[:ss]) in den
 * passenden UTC-Instant um.
 *
 * Bewusst `fromZonedTime` und keine eigene Offset-Rechnung: Wer den Offset an
 * dem Instant bestimmt, der entsteht, wenn man die Lokalzeit als UTC liest,
 * greift an den beiden Umstellungstagen für 01:00–01:59 daneben und landet eine
 * Stunde zu früh bzw. zu spät — bei einer Zeiterfassung wäre das eine Stunde
 * Abrechnungsdifferenz.
 */
export function parseFromBerlinLocal(isoLocal: string): Date {
  return fromZonedTime(isoLocal, TZ);
}

/** Wert für ein <input type="datetime-local"> in Berlin-Zeit. */
export function isoForBerlinInput(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd'T'HH:mm");
}

/** Kalendertag "YYYY-MM-DD" in Berlin-Zeit — als Map-Key nutzbar. */
export function dayKeyBerlin(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

/** YYYY-MM-DD um n Kalendertage verschieben — DST-sicher über UTC-Arithmetik. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ============================================================================
// ZEITFENSTER (Tag / Woche / Monat)
// ============================================================================

/** Tagesbeginn 00:00 Berlin. */
export function startOfDayBerlin(now: Date = new Date()): Date {
  return parseFromBerlinLocal(`${dayKeyBerlin(now)}T00:00:00`);
}

/** Tagesende = Beginn des Folgetags (00:00 Berlin). */
export function endOfDayBerlin(now: Date = new Date()): Date {
  return parseFromBerlinLocal(`${shiftYmd(dayKeyBerlin(now), 1)}T00:00:00`);
}

/** Wochenstart Montag 00:00 Berlin. */
export function startOfWeekBerlin(now: Date = new Date()): Date {
  const day = parseInt(formatInTimeZone(now, TZ, "i"), 10); // 1=Mo … 7=So
  return parseFromBerlinLocal(
    `${shiftYmd(dayKeyBerlin(now), -(day - 1))}T00:00:00`,
  );
}

/** Wochenende = Beginn der Folgewoche (Montag 00:00 Berlin). */
export function endOfWeekBerlin(now: Date = new Date()): Date {
  const day = parseInt(formatInTimeZone(now, TZ, "i"), 10);
  return parseFromBerlinLocal(
    `${shiftYmd(dayKeyBerlin(now), 7 - (day - 1))}T00:00:00`,
  );
}

/** Monatsbeginn 00:00 Berlin. */
export function startOfMonthBerlin(date: Date): Date {
  const zoned = toZonedTime(date, TZ);
  const y = zoned.getFullYear();
  const m = zoned.getMonth();
  return parseFromBerlinLocal(
    `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00`,
  );
}

/** Monatsende = letzte Millisekunde des Monats. */
export function endOfMonthBerlin(date: Date): Date {
  const zoned = toZonedTime(date, TZ);
  const y = zoned.getFullYear();
  const m = zoned.getMonth() + 1;
  const next = parseFromBerlinLocal(
    m === 12
      ? `${y + 1}-01-01T00:00:00`
      : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00`,
  );
  return new Date(next.getTime() - 1);
}

// ============================================================================
// MONATS-NAVIGATION (Query-Param "YYYY-MM")
// ============================================================================

/**
 * Parst einen ?monat=YYYY-MM-Parameter zu einem Zeitpunkt im betreffenden
 * Monat. Ungültige oder fehlende Werte ergeben den aktuellen Monat.
 */
export function parseMonthParam(raw: string | undefined): Date {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    // Nicht nur das Format prüfen: "2026-13" passt auf die Regex, ergibt aber
    // ein Invalid Date und würde beim Formatieren eine RangeError werfen (500
    // statt Fallback), sobald jemand die URL von Hand tippt.
    const monat = Number(raw.slice(5, 7));
    if (monat >= 1 && monat <= 12) {
      const d = parseFromBerlinLocal(`${raw}-01T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

/**
 * Monats-Schlüssel "YYYY-MM" in Berlin-Zeit. Lexikografisch = chronologisch
 * sortierbar, daher auch für Vergleiche ("liegt in der Zukunft?") nutzbar.
 */
export function monthKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  })
    .format(d)
    .slice(0, 7);
}

/**
 * Verschiebt einen Zeitpunkt um `delta` Monate und liefert den Monatsanfang
 * (00:00 Berlin) des Zielmonats — mit korrektem Jahres-Überlauf.
 */
export function addMonthsBerlin(d: Date, delta: number): Date {
  const [y, m] = monthKey(d).split("-").map(Number);
  const nm = m + delta;
  const ny = y + Math.floor((nm - 1) / 12);
  const nmm = ((((nm - 1) % 12) + 12) % 12) + 1;
  return parseFromBerlinLocal(
    `${ny}-${String(nmm).padStart(2, "0")}-01T00:00:00`,
  );
}

// ============================================================================
// STUNDEN-SUMMEN
// ============================================================================

export type ClampedEntry = {
  clockIn: Date;
  clockOut: Date | null;
};

/** Minuten zwischen [from, to], geklemmt auf [windowStart, windowEnd]. */
function overlapMinutes(
  from: Date,
  to: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = Math.max(from.getTime(), windowStart.getTime());
  const end = Math.min(to.getTime(), windowEnd.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

/**
 * Summiert die Minuten aller Einträge innerhalb von [windowStart, windowEnd].
 * Laufende Einträge (clockOut = null) zählen nur bis `now`; abgeschlossene
 * Einträge zählen ihre volle erfasste Dauer — dadurch zählt ein Krank-Tag
 * (08:00–16:00) als volle 8 Stunden, auch wenn `now` noch davor liegt.
 */
export function totalMinutesInWindow(
  entries: ClampedEntry[],
  windowStart: Date,
  windowEnd: Date,
  now: Date = new Date(),
): number {
  let sum = 0;
  for (const e of entries) {
    const end = e.clockOut ?? now;
    sum += overlapMinutes(e.clockIn, end, windowStart, windowEnd);
  }
  return sum;
}

// ============================================================================
// CSV-EXPORT
// ============================================================================

/**
 * Rundet einen Zeitpunkt auf die vorige Viertelstunde ab (Berlin).
 * Bewusste fachliche Entscheidung aus dem Vorgängersystem: Beginn UND Ende
 * werden abgerundet, damit die Abrechnung in Viertelstunden aufgeht.
 */
export function floorQuarter(d: Date): Date {
  const minutes = Number(formatInTimeZone(d, TZ, "mm"));
  const floored = minutes - (minutes % 15);
  const base = formatInTimeZone(d, TZ, "yyyy-MM-dd'T'HH");
  return parseFromBerlinLocal(
    `${base}:${String(floored).padStart(2, "0")}:00`,
  );
}

/** Minuten als Dezimalstunden mit deutschem Komma ("7,75"). */
export function hoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2).replace(".", ",");
}

/** Feld für eine semikolon-getrennte CSV maskieren. */
export function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Baut eine Excel-taugliche CSV: Semikolon-getrennt, CRLF, UTF-8-BOM.
 */
export function buildCsv(rows: string[][]): string {
  const body = rows
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");
  return "﻿" + body + "\r\n";
}
