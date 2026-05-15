import Link from "next/link";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { StatusPill, STATUS_LABELS } from "@/components/crm/status-pill";
import { NewContactModal } from "./_components/new-contact-modal";
import { ContactFilter } from "./_components/contact-filter";
import type { ContactStatus } from "./actions";

function formatDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const org = await requireActiveOrg();

  // Counts pro Status für Filter-Buttons
  const countRows = await db
    .select({
      status: contacts.status,
      count: sql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(eq(contacts.orgId, org.id))
    .groupBy(contacts.status);

  const counts: Record<string, number> = { all: 0 };
  for (const r of countRows) {
    counts[r.status] = r.count;
    counts.all += r.count;
  }

  const list = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      status: contacts.status,
      tags: contacts.tags,
      lastContactAt: contacts.lastContactAt,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      filterStatus &&
        Object.keys(STATUS_LABELS).includes(filterStatus)
        ? and(
            eq(contacts.orgId, org.id),
            eq(contacts.status, filterStatus as ContactStatus),
          )
        : eq(contacts.orgId, org.id),
    )
    .orderBy(desc(contacts.createdAt))
    .limit(200);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Kontakte</h2>
          <p className="text-xs text-sub mt-0.5">
            {counts.all} Kontakte gesamt
          </p>
        </div>
        <NewContactModal />
      </div>

      <ContactFilter counts={counts} />

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {list.length === 0 ? (
          <EmptyState filtered={Boolean(filterStatus)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-line text-left text-[11px] uppercase tracking-wide text-sub">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Firma</th>
                  <th className="px-4 py-2.5 font-medium">E-Mail</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">
                    Letzter Kontakt
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const fullName = [c.firstName, c.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={c.id} className="hover:bg-bg transition">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/crm/${c.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {fullName || "(ohne Namen)"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-sub">
                        {c.companyName ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sub truncate max-w-[200px]">
                        {c.email ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-px rounded-full bg-bg text-sub"
                            >
                              {t}
                            </span>
                          ))}
                          {c.tags.length > 3 && (
                            <span className="text-[10px] text-sub">
                              +{c.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sub whitespace-nowrap">
                        {formatDate(c.lastContactAt)}
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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="p-12 text-center">
      <p className="text-sm text-sub">
        {filtered
          ? "Keine Kontakte in diesem Status."
          : "Noch keine Kontakte angelegt."}
      </p>
      <p className="text-xs text-sub mt-1">
        Lege oben rechts deinen ersten Kontakt an.
      </p>
    </div>
  );
}
