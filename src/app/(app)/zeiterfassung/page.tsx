import Link from "next/link";
import { and, asc, eq, gte, isNull, or } from "drizzle-orm";
import { UsersRound } from "lucide-react";

import { db } from "@/db";
import { employees, timeEntries } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  endOfDayBerlin,
  endOfWeekBerlin,
  formatDuration,
  formatTime,
  startOfDayBerlin,
  startOfWeekBerlin,
  totalMinutesInWindow,
} from "@/lib/zeiterfassung";

export const dynamic = "force-dynamic";

type Stempelung = {
  clockIn: Date;
  clockOut: Date | null;
  sick: boolean;
};

export default async function ZeiterfassungUebersichtPage() {
  const org = await requireActiveOrg();

  const jetzt = new Date();
  const tagStart = startOfDayBerlin(jetzt);
  const tagEnde = endOfDayBerlin(jetzt);
  const wochenStart = startOfWeekBerlin(jetzt);
  const wochenEnde = endOfWeekBerlin(jetzt);

  // Zwei Queries reichen: alle aktiven Mitarbeiter und alle Einträge, die für
  // Tages-/Wochensumme oder Status relevant sind. `clockOut >= wochenStart`
  // fängt auch Einträge mit ein, die VOR Wochenbeginn begonnen haben und erst
  // danach endeten — die zählen anteilig zur Woche.
  const [mitarbeiterRows, eintragRows] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.orgId, org.id), eq(employees.active, true)))
      .orderBy(asc(employees.name)),
    db
      .select({
        employeeId: timeEntries.employeeId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        sick: timeEntries.sick,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, org.id),
          or(
            isNull(timeEntries.clockOut),
            gte(timeEntries.clockOut, wochenStart),
          ),
        ),
      ),
  ]);

  // Gruppieren in JS — spart eine Query pro Mitarbeiter.
  const proMitarbeiter = new Map<string, Stempelung[]>();
  for (const r of eintragRows) {
    const liste = proMitarbeiter.get(r.employeeId);
    const eintrag: Stempelung = {
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      sick: r.sick,
    };
    if (liste) liste.push(eintrag);
    else proMitarbeiter.set(r.employeeId, [eintrag]);
  }

  const zeilen = mitarbeiterRows.map((m) => {
    const eintraege = proMitarbeiter.get(m.id) ?? [];
    const laufend = eintraege.find((e) => e.clockOut === null) ?? null;
    // Krank: entweder ein laufender Krank-Eintrag oder ein Krank-Eintrag,
    // der das heutige Tagesfenster überschneidet.
    const krank = eintraege.some(
      (e) =>
        e.sick &&
        e.clockIn < tagEnde &&
        (e.clockOut ?? jetzt).getTime() >= tagStart.getTime(),
    );
    return {
      id: m.id,
      name: m.name,
      laufend,
      krank,
      heuteMinuten: totalMinutesInWindow(eintraege, tagStart, tagEnde, jetzt),
      wocheMinuten: totalMinutesInWindow(
        eintraege,
        wochenStart,
        wochenEnde,
        jetzt,
      ),
    };
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Übersicht</h2>
        <p className="text-xs text-sub">
          Wer ist gerade eingestempelt, und wie viele Stunden sind heute und
          diese Woche zusammengekommen.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">Team-Status</h3>
          <Link
            href="/zeiterfassung/mitarbeiter"
            className="text-xs text-sub hover:text-ink"
          >
            Mitarbeiter verwalten
          </Link>
        </div>

        {zeilen.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 pb-10 pt-6 text-center">
            <UsersRound className="h-6 w-6 text-sub" strokeWidth={1.5} />
            <p className="text-sm text-ink">Noch keine Mitarbeiter angelegt.</p>
            <p className="text-xs text-sub max-w-sm">
              Leg zuerst einen Mitarbeiter an — danach koppelst du sein Handy
              einmalig per QR-Code, und er kann stempeln.
            </p>
            <Link
              href="/zeiterfassung/mitarbeiter"
              className="mt-2 h-9 px-3 inline-flex items-center rounded-md text-sm font-medium bg-brand text-white hover:opacity-90"
            >
              Ersten Mitarbeiter anlegen
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-sub font-medium">
                  <th className="text-left font-medium px-5 pb-2">
                    Mitarbeiter
                  </th>
                  <th className="text-left font-medium px-5 pb-2">Status</th>
                  <th className="text-right font-medium px-5 pb-2">Heute</th>
                  <th className="text-right font-medium px-5 pb-2">
                    Diese Woche
                  </th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <Link
                        href={`/zeiterfassung/mitarbeiter/${z.id}`}
                        className="font-medium text-ink hover:text-accent-ink"
                      >
                        {z.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {z.laufend && !z.laufend.sick ? (
                        <span className="pill bg-ok/10 text-ok">
                          Eingestempelt seit {formatTime(z.laufend.clockIn)}
                        </span>
                      ) : z.krank ? (
                        <span className="pill bg-warn/10 text-warn">Krank</span>
                      ) : (
                        <span className="pill bg-bg text-sub border border-line">
                          Ausgestempelt
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink">
                      {formatDuration(z.heuteMinuten)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink">
                      {formatDuration(z.wocheMinuten)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
