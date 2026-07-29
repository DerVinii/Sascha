/**
 * Prüft die Zeitrechnung der Zeiterfassung (src/lib/zeiterfassung.ts).
 *
 *   npm run pruefe:zeiterfassung
 *
 * Läuft bewusst mit TZ=UTC, weil der Server auf Vercel in UTC läuft, die
 * Stempelzeiten aber immer aus Sicht des Mitarbeiters in Europe/Berlin gelten.
 * Genau in dieser Differenz stecken die teuren Fehler: Eine falsch gerechnete
 * Stunde ist hier eine falsch abgerechnete Stunde.
 *
 * Abgedeckt sind unter anderem beide Zeitumstellungstage (der 23- und der
 * 25-Stunden-Tag), Nachtschichten über Mitternacht und Monatsgrenzen, die
 * Viertelstunden-Rundung des CSV-Exports und ungültige ?monat=-Parameter.
 */
import {
  parseFromBerlinLocal,
  startOfDayBerlin,
  endOfDayBerlin,
  startOfWeekBerlin,
  endOfWeekBerlin,
  startOfMonthBerlin,
  endOfMonthBerlin,
  dayKeyBerlin,
  shiftYmd,
  monthKey,
  addMonthsBerlin,
  formatMonthYear,
  parseMonthParam,
  totalMinutesInWindow,
  floorQuarter,
  hoursDecimal,
  formatDuration,
  isoForBerlinInput,
} from "../src/lib/zeiterfassung";

let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  const ok = String(ist) === String(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "OK  " : "FEHL"}  ${name.padEnd(52)} ist=${ist}${ok ? "" : `  soll=${soll}`}`);
}

console.log("Prozess-Zeitzone:", Intl.DateTimeFormat().resolvedOptions().timeZone, "\n");

// --- Offset: Winter (MEZ, +01) vs. Sommer (MESZ, +02) ---
pruefe("Winter 12:00 Berlin -> UTC", parseFromBerlinLocal("2026-01-15T12:00:00").toISOString(), "2026-01-15T11:00:00.000Z");
pruefe("Sommer 12:00 Berlin -> UTC", parseFromBerlinLocal("2026-07-15T12:00:00").toISOString(), "2026-07-15T10:00:00.000Z");

// --- Tagesgrenzen um Mitternacht herum ---
// 2026-02-03 23:30 Berlin = 22:30Z -> Tag muss der 3. sein, nicht der 3./4. Wechsel
const spaetabends = new Date("2026-02-03T22:30:00Z");
pruefe("23:30 Berlin gehoert zum 03.02.", dayKeyBerlin(spaetabends), "2026-02-03");
pruefe("Tagesbeginn zu 23:30 Berlin", startOfDayBerlin(spaetabends).toISOString(), "2026-02-02T23:00:00.000Z");
pruefe("Tagesende zu 23:30 Berlin", endOfDayBerlin(spaetabends).toISOString(), "2026-02-03T23:00:00.000Z");
// 00:30 Berlin am 4.2. = 23:30Z am 3.2. -> muss zum 4. gehoeren
pruefe("00:30 Berlin gehoert zum 04.02.", dayKeyBerlin(new Date("2026-02-03T23:30:00Z")), "2026-02-04");

// --- DST-Umstellung Fruehjahr: 29.03.2026, 02:00 -> 03:00 (Tag hat 23 h) ---
const dstFruehjahr = new Date("2026-03-29T12:00:00Z");
const tagStart = startOfDayBerlin(dstFruehjahr);
const tagEnde = endOfDayBerlin(dstFruehjahr);
pruefe("29.03.2026 hat 23 Stunden", (tagEnde.getTime() - tagStart.getTime()) / 3600000, 23);

// --- DST-Umstellung Herbst: 25.10.2026, 03:00 -> 02:00 (Tag hat 25 h) ---
const dstHerbst = new Date("2026-10-25T12:00:00Z");
pruefe(
  "25.10.2026 hat 25 Stunden",
  (endOfDayBerlin(dstHerbst).getTime() - startOfDayBerlin(dstHerbst).getTime()) / 3600000,
  25,
);

// --- Woche ueber die DST-Umstellung (Mo 23.03. - Mo 30.03.) hat 167 h ---
const inDstWoche = new Date("2026-03-25T12:00:00Z");
pruefe("Woche mit Fruehjahrs-Umstellung hat 167 h",
  (endOfWeekBerlin(inDstWoche).getTime() - startOfWeekBerlin(inDstWoche).getTime()) / 3600000, 167);

// --- Wochenstart ist Montag ---
// 2026-02-08 ist ein Sonntag -> Wochenstart muss Mo 02.02. sein
pruefe("Sonntag 08.02. -> Wochenstart Mo 02.02.", dayKeyBerlin(startOfWeekBerlin(new Date("2026-02-08T12:00:00Z"))), "2026-02-02");
pruefe("Montag 02.02. -> Wochenstart Mo 02.02.", dayKeyBerlin(startOfWeekBerlin(new Date("2026-02-02T12:00:00Z"))), "2026-02-02");

// --- shiftYmd ueber Monats- und Schaltjahresgrenzen ---
pruefe("shiftYmd 28.02.2028 +1 (Schaltjahr)", shiftYmd("2028-02-28", 1), "2028-02-29");
pruefe("shiftYmd 31.12. +1", shiftYmd("2026-12-31", 1), "2027-01-01");
pruefe("shiftYmd 01.01. -1", shiftYmd("2026-01-01", -1), "2025-12-31");

// --- Monatsgrenzen + Navigation ---
pruefe("Monatsbeginn Juli 2026", startOfMonthBerlin(new Date("2026-07-15T12:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z");
pruefe("Monatsende Juli 2026 (letzte ms)", endOfMonthBerlin(new Date("2026-07-15T12:00:00Z")).toISOString(), "2026-07-31T21:59:59.999Z");
pruefe("addMonthsBerlin Dez +1 -> Jan Folgejahr", monthKey(addMonthsBerlin(parseFromBerlinLocal("2026-12-10T12:00:00"), 1)), "2027-01");
pruefe("addMonthsBerlin Jan -1 -> Dez Vorjahr", monthKey(addMonthsBerlin(parseFromBerlinLocal("2026-01-10T12:00:00"), -1)), "2025-12");

// --- Summen: Eintrag ragt ueber das Fenster hinaus (Nachtschicht ueber Mitternacht) ---
const nachtschicht = [{
  clockIn: parseFromBerlinLocal("2026-02-03T22:00:00"),
  clockOut: parseFromBerlinLocal("2026-02-04T06:00:00"),
}];
const tag3 = new Date("2026-02-03T12:00:00Z");
pruefe("Nachtschicht: 2 h fallen auf den 03.02.",
  totalMinutesInWindow(nachtschicht, startOfDayBerlin(tag3), endOfDayBerlin(tag3)), 120);
const tag4 = new Date("2026-02-04T12:00:00Z");
pruefe("Nachtschicht: 6 h fallen auf den 04.02.",
  totalMinutesInWindow(nachtschicht, startOfDayBerlin(tag4), endOfDayBerlin(tag4)), 360);

// --- Laufender Eintrag zaehlt nur bis jetzt ---
const jetzt = parseFromBerlinLocal("2026-02-03T12:00:00");
pruefe("Laufender Eintrag zaehlt bis jetzt (3 h)",
  totalMinutesInWindow(
    [{ clockIn: parseFromBerlinLocal("2026-02-03T09:00:00"), clockOut: null }],
    startOfDayBerlin(tag3), endOfDayBerlin(tag3), jetzt), 180);

// --- Krank-Tag zaehlt volle 8 h, auch wenn "jetzt" davor liegt ---
pruefe("Krank-Tag zaehlt volle 8 h",
  totalMinutesInWindow(
    [{ clockIn: parseFromBerlinLocal("2026-02-03T08:00:00"), clockOut: parseFromBerlinLocal("2026-02-03T16:00:00") }],
    startOfDayBerlin(tag3), endOfDayBerlin(tag3), parseFromBerlinLocal("2026-02-03T09:00:00")), 480);

// --- CSV-Rundung ---
pruefe("floorQuarter 08:07 -> 08:00", isoForBerlinInput(floorQuarter(parseFromBerlinLocal("2026-07-15T08:07:00"))), "2026-07-15T08:00");
pruefe("floorQuarter 16:59 -> 16:45", isoForBerlinInput(floorQuarter(parseFromBerlinLocal("2026-07-15T16:59:00"))), "2026-07-15T16:45");
pruefe("floorQuarter 08:00 bleibt 08:00", isoForBerlinInput(floorQuarter(parseFromBerlinLocal("2026-01-15T08:00:00"))), "2026-01-15T08:00");
pruefe("hoursDecimal 465 min -> 7,75", hoursDecimal(465), "7,75");
pruefe("formatDuration 465 min -> 7:45 h", formatDuration(465), "7:45 h");

// --- Regression: Lokalzeit muss sich verlustfrei hin- und zurueckrechnen ---
// Frueher lag parseFromBerlinLocal an den Umstellungstagen fuer 01:00-01:59
// eine Stunde daneben. Alle Viertelstunden beider Umstellungstage durchgehen.
{
  let abweichungen = 0;
  for (const tag of ["2026-03-29", "2026-10-25"]) {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 15, 30, 45]) {
        const lokal = `${tag}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        const instant = parseFromBerlinLocal(lokal);
        const zurueck = isoForBerlinInput(instant);
        // 02:00-02:59 am 29.03. existiert nicht (Uhr springt) — dort ist eine
        // Verschiebung korrektes Verhalten, deshalb ausgenommen.
        const uebersprungen = tag === "2026-03-29" && h === 2;
        // 02:00-02:59 am 25.10. gibt es zweimal — die erste Lesart ist ok.
        const doppelt = tag === "2026-10-25" && h === 2;
        if (!uebersprungen && !doppelt && zurueck !== lokal.slice(0, 16)) {
          abweichungen++;
          if (abweichungen <= 3) console.log(`  Abweichung: ${lokal} -> ${zurueck}`);
        }
      }
    }
  }
  pruefe("Umstellungstage: Lokalzeit rundreisefest (192 Werte)", abweichungen, 0);
}

// --- Regression: ungueltiger ?monat= darf keinen 500er ausloesen ---
for (const roh of ["2026-13", "2026-00", "abcd-ef", "", "2026-1", undefined]) {
  const d = parseMonthParam(roh as string | undefined);
  const ok = !Number.isNaN(d.getTime());
  if (!ok) fehler++;
  console.log(`${ok ? "OK  " : "FEHL"}  parseMonthParam(${JSON.stringify(roh)}) ergibt gueltiges Datum`);
}
// und formatMonthYear darf darauf nicht werfen
try {
  formatMonthYear(parseMonthParam("2026-13"));
  console.log("OK    formatMonthYear wirft bei ?monat=2026-13 nicht");
} catch {
  fehler++;
  console.log("FEHL  formatMonthYear wirft bei ?monat=2026-13");
}

console.log(fehler === 0 ? "\n=> Alle Pruefungen bestanden" : `\n=> ${fehler} FEHLER`);
process.exit(fehler === 0 ? 0 : 1);
