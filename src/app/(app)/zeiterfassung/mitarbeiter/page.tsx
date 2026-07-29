import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices, employees } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { monthKey } from "@/lib/zeiterfassung";
import { GesamtExport } from "./_components/gesamt-export";
import { MitarbeiterListe } from "./_components/mitarbeiter-liste";
import { NeuerMitarbeiterButton } from "./_components/neuer-mitarbeiter-button";

export const dynamic = "force-dynamic";

export default async function MitarbeiterPage() {
  const org = await requireActiveOrg();

  // Geräte-Zähler direkt mitladen: nur nicht gesperrte Geräte zählen, denn nur
  // die können stempeln. LEFT JOIN, damit Mitarbeiter ohne Gerät nicht wegfallen.
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      active: employees.active,
      geraete: sql<number>`count(${employeeDevices.id})`.mapWith(Number),
    })
    .from(employees)
    .leftJoin(
      employeeDevices,
      and(
        eq(employeeDevices.employeeId, employees.id),
        eq(employeeDevices.revoked, false),
      ),
    )
    .where(eq(employees.orgId, org.id))
    .groupBy(employees.id)
    // Aktive zuerst (boolean DESC = true vor false), dann alphabetisch.
    .orderBy(desc(employees.active), asc(employees.name));

  const aktive = rows.filter((r) => r.active).length;
  const inaktive = rows.length - aktive;
  const aktuellerMonat = monthKey(new Date());

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-ink">Mitarbeiter</h1>
          <p className="text-xs text-sub mt-1">
            {aktive} aktiv, {inaktive} inaktiv. Jeder Mitarbeiter koppelt sein
            Handy einmalig per QR-Code — erst danach kann er stempeln.
          </p>
        </div>
        <NeuerMitarbeiterButton />
      </div>

      <MitarbeiterListe mitarbeiter={rows} />

      <GesamtExport standardMonat={aktuellerMonat} />
    </div>
  );
}
