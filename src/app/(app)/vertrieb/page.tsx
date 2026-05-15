import Link from "next/link";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { NewContactModal } from "../crm/_components/new-contact-modal";
import { CsvImportModal } from "./_components/csv-import-modal";
import { LeadRowActions } from "./_components/lead-row-actions";

function formatDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export default async function VertriebPage() {
  const org = await requireActiveOrg();

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.status, "lead")));

  const totalLeads = totalRow?.count ?? 0;

  const leads = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      tags: contacts.tags,
      source: contacts.source,
      createdAt: contacts.createdAt,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.orgId, org.id), eq(contacts.status, "lead")))
    .orderBy(desc(contacts.createdAt))
    .limit(500);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Lead-Inbox</h2>
          <p className="text-xs text-sub mt-0.5">
            {totalLeads} offene Lead{totalLeads !== 1 ? "s" : ""} — neu eingegangene Kontakte
            vor Qualifizierung
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvImportModal />
          <NewContactModal />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-sub">Keine offenen Leads.</p>
            <p className="text-xs text-sub mt-1">
              Lege manuell einen an oder importiere eine CSV-Datei.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-line text-left text-[11px] uppercase tracking-wide text-sub">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Firma</th>
                  <th className="px-4 py-2.5 font-medium">E-Mail</th>
                  <th className="px-4 py-2.5 font-medium">Telefon</th>
                  <th className="px-4 py-2.5 font-medium">Quelle</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                    Eingegangen
                  </th>
                  <th className="px-4 py-2.5 font-medium text-right">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((l) => {
                  const fullName = [l.firstName, l.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={l.id} className="hover:bg-bg transition">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/crm/${l.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {fullName || "(ohne Namen)"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-sub">
                        {l.companyName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sub truncate max-w-[200px]">
                        {l.email ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sub">
                        {l.phone ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sub">
                        {l.source ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sub whitespace-nowrap">
                        {formatDate(l.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <LeadRowActions contactId={l.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
