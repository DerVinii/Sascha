import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { employees, timeEntries } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { hatAppZugang } from "@/lib/server/app-zugang";
import {
  buildCsv,
  dayKeyBerlin,
  durationMinutes,
  endOfMonthBerlin,
  floorQuarter,
  formatDateTime,
  formatTime,
  hoursDecimal,
  monthKey,
  parseMonthParam,
  startOfMonthBerlin,
} from "@/lib/zeiterfassung";

// Datei-Download → API-Route statt Server Action. Query zur Laufzeit.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ABSICHERUNG: `src/middleware.ts` schützt /api/* mit dem APP_PASSWORD-Gate und
// antwortet ohne gültiges `sk_zugang`-Cookie mit 401. Diese Route prüft trotzdem
// selbst — die Datei enthält die Arbeitszeiten aller Mitarbeiter, und eine
// Fehlkonfiguration (nicht gesetztes APP_PASSWORD auf einem Preview-Deployment,
// Lücke im Matcher-Regex) würde sie sonst an jeden Besucher ausliefern.

/** Name → dateinamentauglich in reinem ASCII ("Jörg Müller" → "joerg-mueller"). */
function dateinamenSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "mitarbeiter"
  );
}

export async function GET(request: NextRequest) {
  if (!(await hatAppZugang())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const org = await requireActiveOrg();

  const monatRaw = request.nextUrl.searchParams.get("monat") ?? undefined;
  const mitarbeiterId = request.nextUrl.searchParams.get("mitarbeiter");

  // Fehlender/ungültiger Monat → laufender Monat.
  const referenz = parseMonthParam(monatRaw);
  const von = startOfMonthBerlin(referenz);
  const bis = endOfMonthBerlin(referenz);
  const monatLabel = monthKey(von);

  // Einzelexport: Mitarbeiter muss zur Org gehören.
  let mitarbeiter: { id: string; name: string } | null = null;
  if (mitarbeiterId) {
    // Ohne Formatprüfung wirft Postgres bei einer kaputten ID einen 500er.
    if (!/^[0-9a-f-]{36}$/i.test(mitarbeiterId)) {
      return new NextResponse("Mitarbeiter nicht gefunden", { status: 404 });
    }
    const [zeile] = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.id, mitarbeiterId), eq(employees.orgId, org.id)))
      .limit(1);
    if (!zeile) {
      return new NextResponse("Mitarbeiter nicht gefunden", { status: 404 });
    }
    mitarbeiter = zeile;
  }

  const eintraege = await db
    .select({
      name: employees.name,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      sick: timeEntries.sick,
      wasEdited: timeEntries.wasEdited,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(
      and(
        eq(timeEntries.orgId, org.id),
        gte(timeEntries.clockIn, von),
        lte(timeEntries.clockIn, bis),
        ...(mitarbeiter ? [eq(timeEntries.employeeId, mitarbeiter.id)] : []),
      ),
    )
    .orderBy(asc(employees.name), asc(timeEntries.clockIn));

  const alle = !mitarbeiter;

  const kopf = alle
    ? [
        "Mitarbeiter",
        "Datum",
        "Beginn",
        "Ende",
        "Arbeitszeit (h)",
        "Modus",
        "Bearbeitet",
      ]
    : ["Datum", "Beginn", "Ende", "Arbeitszeit (h)", "Modus", "Bearbeitet"];

  let summeMinuten = 0;

  const zeilen = eintraege.map((e) => {
    // Fachliche Regel aus dem Vorgängersystem: Beginn UND Ende werden auf die
    // vorige Viertelstunde ABGERUNDET, damit die Abrechnung in Viertelstunden
    // aufgeht. Die Arbeitszeit wird aus genau diesen gerundeten Zeiten
    // berechnet, damit die Zeile in sich stimmig ist.
    const beginn = floorQuarter(e.clockIn);
    const ende = e.clockOut ? floorQuarter(e.clockOut) : null;
    const minuten = ende ? durationMinutes(beginn, ende) : 0;
    summeMinuten += minuten;

    // Nachtschicht: Die Datum-Spalte nennt nur den Starttag. Stünde in der
    // Ende-Spalte dann bloß "06:00", läse sich 31.10. 22:00 → 06:00 wie eine
    // rückwärts laufende Schicht. Endet der Eintrag an einem anderen
    // Kalendertag, steht das Datum deshalb mit im Feld ("01.11. 06:00").
    const endeText = ende
      ? dayKeyBerlin(ende) === dayKeyBerlin(beginn)
        ? formatTime(ende)
        : `${formatDateTime(ende, "dd.MM.")} ${formatTime(ende)}`
      : "";

    const modus = e.sick ? "Krank" : "Arbeit";
    const felder = [
      formatDateTime(e.clockIn, "dd.MM.yyyy"),
      formatTime(beginn),
      endeText,
      ende ? hoursDecimal(minuten) : "",
      // Laufende Einträge haben kein Ende und keine Arbeitszeit — der Hinweis
      // steht deshalb in der Modus-Spalte.
      ende ? modus : `${modus} (läuft)`,
      e.wasEdited ? "ja" : "",
    ];
    return alle ? [e.name, ...felder] : felder;
  });

  // Genau EINE Gesamtsumme am Ende — beim Gesamtexport bewusst keine
  // Zwischensummen je Mitarbeiter.
  const summenZeile = alle
    ? ["Summe", "", "", "", hoursDecimal(summeMinuten), "", ""]
    : ["Summe", "", "", hoursDecimal(summeMinuten), "", ""];

  const csv = buildCsv([kopf, ...zeilen, summenZeile]);

  const dateiname = mitarbeiter
    ? `zeiten_${dateinamenSlug(mitarbeiter.name)}_${monatLabel}.csv`
    : `zeiten_alle_${monatLabel}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
