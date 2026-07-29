import Link from "next/link";
import { ChevronLeft, ChevronRight, SmartphoneNfc } from "lucide-react";
import { and, asc, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";
import { getCurrentDeviceEmployee } from "@/lib/server/zeiterfassung/auth";
import {
  addMonthsBerlin,
  durationMinutes,
  endOfDayBerlin,
  endOfMonthBerlin,
  endOfWeekBerlin,
  formatDateTime,
  formatDuration,
  formatMonthYear,
  formatTime,
  monthKey,
  parseMonthParam,
  startOfDayBerlin,
  startOfMonthBerlin,
  startOfWeekBerlin,
  totalMinutesInWindow,
} from "@/lib/zeiterfassung";
import { GeraetAbmelden } from "./_components/geraet-abmelden";

export const dynamic = "force-dynamic";

export default async function MeineZeitenPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await getCurrentDeviceEmployee();

  // Kein Redirect: Wer den Link ohne gekoppeltes Handy öffnet, soll ruhig
  // erklärt bekommen, was fehlt — dieselbe Karte wie auf der Stempel-Seite.
  if (!session) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5 space-y-3 text-center">
          <div className="flex justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg text-sub">
              <SmartphoneNfc className="h-5 w-5" />
            </span>
          </div>
          {/* Die einzige <h1> der Seite steht im Layout ("Zeiterfassung"). */}
          <h2 className="text-base font-semibold text-ink">
            Gerät nicht eingerichtet
          </h2>
          <p className="text-sm text-sub">
            Dieses Handy ist noch nicht mit einem Mitarbeiter verknüpft. Bitte
            den QR-Code von Sascha scannen — danach bleibt das Gerät dauerhaft
            angemeldet.
          </p>
        </div>
      </div>
    );
  }

  const employeeId = session.employee.id;
  const orgId = session.employee.orgId;

  const jetzt = new Date();
  const tagStart = startOfDayBerlin(jetzt);
  const tagEnde = endOfDayBerlin(jetzt);
  const wochenStart = startOfWeekBerlin(jetzt);
  const wochenEnde = endOfWeekBerlin(jetzt);

  const sp = await searchParams;
  const monat = parseMonthParam(sp.monat);
  const monatsStart = startOfMonthBerlin(monat);
  const monatsEnde = endOfMonthBerlin(monat);
  const vorherigerMonat = monthKey(addMonthsBerlin(monat, -1));
  const naechsterMonat = monthKey(addMonthsBerlin(monat, 1));
  // In die Zukunft gibt es nichts zu sehen — Pfeil dann gar nicht verlinken.
  const kannVor = monthKey(monat) < monthKey(jetzt);

  const [wochenEintraege, monatsEintraege] = await Promise.all([
    // Für die Kacheln: alles, was die laufende Woche berührt — auch Schichten,
    // die vor Montag 00:00 begonnen haben und erst danach enden (oder noch laufen).
    db
      .select({
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, orgId),
          eq(timeEntries.employeeId, employeeId),
          lt(timeEntries.clockIn, wochenEnde),
          or(
            gte(timeEntries.clockIn, wochenStart),
            isNull(timeEntries.clockOut),
            gte(timeEntries.clockOut, wochenStart),
          ),
        ),
      )
      .orderBy(asc(timeEntries.clockIn)),
    db
      .select({
        id: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        sick: timeEntries.sick,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, orgId),
          eq(timeEntries.employeeId, employeeId),
          gte(timeEntries.clockIn, monatsStart),
          lte(timeEntries.clockIn, monatsEnde),
        ),
      )
      .orderBy(desc(timeEntries.clockIn)),
  ]);

  const minutenHeute = totalMinutesInWindow(
    wochenEintraege,
    tagStart,
    tagEnde,
    jetzt,
  );
  const minutenWoche = totalMinutesInWindow(
    wochenEintraege,
    wochenStart,
    wochenEnde,
    jetzt,
  );
  // Abrechnungssicht: Ein Eintrag gehört vollständig zu dem Monat, in dem er
  // BEGONNEN hat — deshalb hier bewusst kein Klemmen auf das Monatsfenster
  // (anders als bei den Kacheln oben, die „wie viel wurde in diesem Fenster
  // gearbeitet“ beantworten). Die Zeilendauer ist immer clockIn → clockOut bzw.
  // jetzt, und die Summe unten ist genau die Summe dieser Zeilen. Sonst zeigte
  // eine Nachtschicht über den Monatswechsel in der Zeile 8:00 h und in der
  // Fußzeile 2:00 h.
  const monatsZeilen = monatsEintraege.map((e) => {
    const laeuft = e.clockOut === null;
    const minuten = durationMinutes(e.clockIn, e.clockOut ?? jetzt);
    return {
      ...e,
      laeuft,
      minuten,
      // Vergessenes Ausstempeln soll auffallen, nicht stillschweigend die
      // Monatssumme aufblähen.
      ungewoehnlichLang: laeuft && minuten > 16 * 60,
    };
  });
  const minutenMonat = monatsZeilen.reduce((summe, z) => summe + z.minuten, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        {/* Die einzige <h1> der Seite steht im Layout ("Zeiterfassung"). */}
        <h2 className="text-base font-semibold text-ink">Meine Zeiten</h2>
        <span className="text-xs text-sub truncate">
          {session.employee.name}
        </span>
      </div>

      {/* Kacheln Heute / Diese Woche */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-[11px] text-sub">Heute</div>
          <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">
            {formatDuration(minutenHeute)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-[11px] text-sub">Diese Woche</div>
          <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">
            {formatDuration(minutenWoche)}
          </div>
        </div>
      </div>

      {/* Monatsnavigation */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/zeit/meine-zeiten?monat=${vorherigerMonat}`}
          aria-label="Vorheriger Monat"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-bg"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-medium text-ink capitalize">
          {formatMonthYear(monatsStart)}
        </span>
        {kannVor ? (
          <Link
            href={`/zeit/meine-zeiten?monat=${naechsterMonat}`}
            aria-label="Nächster Monat"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-bg"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-sub opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Monatstabelle */}
      <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Monat gesamt</h2>
          <span className="text-sm font-semibold text-ink tabular-nums">
            {formatDuration(minutenMonat)}
          </span>
        </div>

        {monatsZeilen.length === 0 ? (
          <p className="text-sm text-sub py-4">
            In diesem Monat wurden noch keine Zeiten erfasst.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-sub font-medium">
                  <th className="text-left font-medium pb-2 px-1">Datum</th>
                  <th className="text-left font-medium pb-2 px-1">Beginn</th>
                  <th className="text-left font-medium pb-2 px-1">Ende</th>
                  <th className="text-right font-medium pb-2 px-1">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {monatsZeilen.map((e) => {
                  const { laeuft, minuten } = e;
                  return (
                    <tr key={e.id} className="border-t border-line align-top">
                      <td className="py-2 px-1">
                        <span className="text-ink tabular-nums whitespace-nowrap">
                          {formatDateTime(e.clockIn, "EEEEEE, dd.MM.")}
                        </span>
                        {e.sick && (
                          <span className="pill bg-warn/10 text-warn ml-1 align-middle">
                            Krank
                          </span>
                        )}
                        {e.ungewoehnlichLang && (
                          <span className="mt-1 block">
                            <span className="pill bg-warn/10 text-warn">
                              läuft ungewöhnlich lange
                            </span>
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 px-1 whitespace-nowrap tabular-nums ${
                          e.sick ? "text-sub" : "text-ink"
                        }`}
                      >
                        {formatTime(e.clockIn)}
                      </td>
                      <td className="py-2 px-1 whitespace-nowrap tabular-nums">
                        {laeuft ? (
                          <span className="text-ok">läuft</span>
                        ) : (
                          <span className={e.sick ? "text-sub" : "text-ink"}>
                            {formatTime(e.clockOut as Date)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1 whitespace-nowrap text-right tabular-nums text-ink">
                        {formatDuration(minuten)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td
                    className="py-2 px-1 text-xs text-sub"
                    colSpan={3}
                  >
                    Summe
                  </td>
                  <td className="py-2 px-1 text-right font-semibold text-ink tabular-nums">
                    {formatDuration(minutenMonat)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Gerätewechsel oder Rückgabe des Diensthandys */}
      <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Dieses Gerät abmelden
        </h2>
        <p className="text-sm text-sub">
          Trennt dieses Handy von deinem Konto — sinnvoll, wenn du das Gerät
          wechselst oder abgibst. Danach kannst du hier nicht mehr stempeln;
          zum Wiederanmelden brauchst du einen neuen QR-Code von Sascha.
        </p>
        <GeraetAbmelden />
      </div>

      <div className="pt-1 text-center">
        <Link
          href="/zeit/stempel"
          className="text-xs text-sub hover:text-ink underline underline-offset-2"
        >
          Zurück zum Stempeln
        </Link>
      </div>
    </div>
  );
}
