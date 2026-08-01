import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { db } from "@/db";
import {
  employeeDevices,
  employees,
  timeEditLogs,
  timeEntries,
} from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  addMonthsBerlin,
  endOfMonthBerlin,
  formatDate,
  formatDateTime,
  formatMonthYear,
  monthKey,
  parseMonthParam,
  startOfMonthBerlin,
} from "@/lib/zeiterfassung";
import { cn } from "@/lib/utils";

import { MitarbeiterKopf } from "./_components/mitarbeiter-kopf";
import { QrEinrichtung } from "./_components/qr-einrichtung";
import { GeraeteListe } from "./_components/geraete-liste";
import { ZeitenTabelle } from "./_components/zeiten-tabelle";
import { EintragHinzufuegen } from "./_components/eintrag-hinzufuegen";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MitarbeiterDetailSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ monat?: string }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const sp = await searchParams;

  // Eine geratene, nicht-UUID-förmige ID würde sonst als Postgres-Fehler
  // hochblubbern statt als saubere 404-Seite.
  if (!UUID_RE.test(id)) notFound();

  const [mitarbeiter] = await db
    .select({
      id: employees.id,
      name: employees.name,
      active: employees.active,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(and(eq(employees.orgId, org.id), eq(employees.id, id)))
    .limit(1);
  if (!mitarbeiter) notFound();

  const monat = parseMonthParam(sp.monat);
  const monatsBeginn = startOfMonthBerlin(monat);
  const monatsEnde = endOfMonthBerlin(monat);
  const aktuellerKey = monthKey(monat);
  const vorherKey = monthKey(addMonthsBerlin(monat, -1));
  const naechsterKey = monthKey(addMonthsBerlin(monat, 1));
  // In die Zukunft blättern ergibt keinen Sinn — es kann dort nichts geben.
  const vorwaertsGesperrt = naechsterKey > monthKey(new Date());

  const [geraeteRows, eintragRows, geloeschtRows] = await Promise.all([
    db
      .select({
        id: employeeDevices.id,
        label: employeeDevices.label,
        userAgent: employeeDevices.userAgent,
        enrolledAt: employeeDevices.enrolledAt,
        lastSeenAt: employeeDevices.lastSeenAt,
        revoked: employeeDevices.revoked,
      })
      .from(employeeDevices)
      .where(
        and(
          eq(employeeDevices.orgId, org.id),
          eq(employeeDevices.employeeId, id),
        ),
      )
      .orderBy(desc(employeeDevices.enrolledAt)),
    db
      .select({
        id: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        sick: timeEntries.sick,
        wasEdited: timeEntries.wasEdited,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, org.id),
          eq(timeEntries.employeeId, id),
          gte(timeEntries.clockIn, monatsBeginn),
          lte(timeEntries.clockIn, monatsEnde),
        ),
      )
      .orderBy(desc(timeEntries.clockIn)),
    // Gelöschte Einträge: die Protokollzeile überlebt das Löschen (ON DELETE SET
    // NULL) und trägt die Eckwerte als Kopie — nur darüber ist eine Löschung
    // überhaupt noch sichtbar. Einsortiert wird nach dem Beginn des gelöschten
    // Eintrags, damit sie im richtigen Monat auftaucht.
    db
      .select({
        id: timeEditLogs.id,
        entryClockIn: timeEditLogs.entryClockIn,
        entryClockOut: timeEditLogs.entryClockOut,
        reason: timeEditLogs.reason,
        createdAt: timeEditLogs.createdAt,
      })
      .from(timeEditLogs)
      .where(
        and(
          eq(timeEditLogs.orgId, org.id),
          eq(timeEditLogs.employeeId, id),
          eq(timeEditLogs.fieldChanged, "deleted"),
          isNotNull(timeEditLogs.entryClockIn),
          gte(timeEditLogs.entryClockIn, monatsBeginn),
          lte(timeEditLogs.entryClockIn, monatsEnde),
        ),
      )
      .orderBy(desc(timeEditLogs.entryClockIn)),
  ]);

  // Änderungsverlauf nur für die Einträge holen, die überhaupt bearbeitet wurden.
  const bearbeiteteIds = eintragRows
    .filter((e) => e.wasEdited)
    .map((e) => e.id);
  const logRows = bearbeiteteIds.length
    ? await db
        .select({
          id: timeEditLogs.id,
          timeEntryId: timeEditLogs.timeEntryId,
          fieldChanged: timeEditLogs.fieldChanged,
          oldValue: timeEditLogs.oldValue,
          newValue: timeEditLogs.newValue,
          reason: timeEditLogs.reason,
          createdAt: timeEditLogs.createdAt,
        })
        .from(timeEditLogs)
        .where(
          and(
            eq(timeEditLogs.orgId, org.id),
            inArray(timeEditLogs.timeEntryId, bearbeiteteIds),
          ),
        )
        .orderBy(desc(timeEditLogs.createdAt))
    : [];

  const logsProEintrag = new Map<string, typeof logRows>();
  for (const log of logRows) {
    // `timeEntryId` ist seit dem Umbau nullable (Löschungen hängen ohne Eintrag
    // im Protokoll) — die Abfrage oben liefert hier zwar nur gesetzte Werte,
    // aber der Typ weiß das nicht.
    const entryId = log.timeEntryId;
    if (!entryId) continue;
    const vorhanden = logsProEintrag.get(entryId);
    if (vorhanden) vorhanden.push(log);
    else logsProEintrag.set(entryId, [log]);
  }

  const geloescht = geloeschtRows.flatMap((g) =>
    g.entryClockIn
      ? [
          {
            id: g.id,
            entryClockIn: g.entryClockIn,
            entryClockOut: g.entryClockOut,
            reason: g.reason,
            createdAt: g.createdAt,
          },
        ]
      : [],
  );

  // Datumswerte gehen als ISO-Strings über die Server/Client-Grenze.
  const eintraege = eintragRows.map((e) => ({
    id: e.id,
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut ? e.clockOut.toISOString() : null,
    sick: e.sick,
    wasEdited: e.wasEdited,
    verlauf: (logsProEintrag.get(e.id) ?? []).map((l) => ({
      id: l.id,
      fieldChanged: l.fieldChanged,
      oldValue: l.oldValue ? l.oldValue.toISOString() : null,
      newValue: l.newValue ? l.newValue.toISOString() : null,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    })),
  }));

  const geraete = geraeteRows.map((g) => ({
    id: g.id,
    label: g.label,
    userAgent: g.userAgent,
    enrolledAt: g.enrolledAt.toISOString(),
    lastSeenAt: g.lastSeenAt.toISOString(),
    revoked: g.revoked,
  }));

  const hatAktiveGeraete = geraete.some((g) => !g.revoked);
  // Auf dem Handy 40 × 40 (Tippfläche), ab md wieder die schlanken 32 × 32.
  const navKlasse =
    "inline-flex h-10 w-10 md:h-8 md:w-8 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-bg";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <MitarbeiterKopf
        id={mitarbeiter.id}
        name={mitarbeiter.name}
        aktiv={mitarbeiter.active}
        erstelltAm={mitarbeiter.createdAt.toISOString()}
      />

      <QrEinrichtung
        employeeId={mitarbeiter.id}
        name={mitarbeiter.name}
        aktiv={mitarbeiter.active}
        hatAktiveGeraete={hatAktiveGeraete}
      />

      <GeraeteListe geraete={geraete} />

      <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={`?monat=${vorherKey}`}
              scroll={false}
              className={navKlasse}
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm font-semibold text-ink capitalize min-w-[9rem] text-center">
              {formatMonthYear(monatsBeginn)}
            </span>
            {vorwaertsGesperrt ? (
              <span
                className={cn(navKlasse, "opacity-40 cursor-not-allowed")}
                aria-disabled="true"
                aria-label="Nächster Monat"
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            ) : (
              <Link
                href={`?monat=${naechsterKey}`}
                scroll={false}
                className={navKlasse}
                aria-label="Nächster Monat"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <EintragHinzufuegen employeeId={mitarbeiter.id} />
            <a
              href={`/api/zeiterfassung/export?monat=${aktuellerKey}&mitarbeiter=${mitarbeiter.id}`}
              download
              className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg inline-flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              CSV
            </a>
          </div>
        </div>

        <ZeitenTabelle
          eintraege={eintraege}
          jetzt={new Date().toISOString()}
        />

        {geloescht.length > 0 && (
          <div className="border-t border-line pt-4 space-y-2">
            <h3 className="text-xs font-semibold text-ink">
              Gelöschte Einträge
            </h3>
            <ul className="space-y-2">
              {geloescht.map((g) => (
                <li key={g.id} className="text-xs text-sub">
                  <span className="text-ink tabular-nums">
                    {formatDate(g.entryClockIn)} ·{" "}
                    {formatDateTime(g.entryClockIn, "HH:mm")} –{" "}
                    {g.entryClockOut
                      ? formatDateTime(g.entryClockOut, "HH:mm")
                      : "offen"}
                  </span>{" "}
                  · gelöscht am {formatDateTime(g.createdAt)} Uhr
                  <span className="block italic">„{g.reason}“</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
