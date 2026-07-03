import { db } from "@/db";
import { contacts, companies, deals, pipelines } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { OrgNameForm } from "../_components/org-name-form";

export const dynamic = "force-dynamic";

async function countRows(
  table: typeof contacts | typeof companies | typeof deals | typeof pipelines,
  orgId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.orgId, orgId));
  return row?.n ?? 0;
}

export default async function OrganisationPage() {
  const org = await requireActiveOrg();

  const [contactCount, companyCount, dealCount, pipelineCount] =
    await Promise.all([
      countRows(contacts, org.id),
      countRows(companies, org.id),
      countRows(deals, org.id),
      countRows(pipelines, org.id),
    ]);

  const stats = [
    { label: "Kontakte", value: contactCount },
    { label: "Firmen", value: companyCount },
    { label: "Deals", value: dealCount },
    { label: "Pipelines", value: pipelineCount },
  ];

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Organisation</h2>
        <p className="text-xs text-sub mb-4">
          Name der Organisation — erscheint in der Seitenleiste.
        </p>
        <OrgNameForm initialName={org.name} />
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Datenbestand</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-line bg-bg/40 p-3"
            >
              <div className="text-xl font-semibold text-ink tabular-nums">
                {s.value}
              </div>
              <div className="text-[11px] text-sub mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">
          Regionales Format
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-w-md">
          <div>
            <dt className="text-[11px] text-sub mb-0.5">Währung</dt>
            <dd className="text-ink">Euro (EUR)</dd>
          </div>
          <div>
            <dt className="text-[11px] text-sub mb-0.5">Datums- & Zahlenformat</dt>
            <dd className="text-ink">Deutsch (de-DE)</dd>
          </div>
        </dl>
        <p className="text-[11px] text-sub mt-3">
          Fest eingestellt — die gesamte App rechnet und formatiert in EUR und
          deutschem Format.
        </p>
      </div>
    </>
  );
}
