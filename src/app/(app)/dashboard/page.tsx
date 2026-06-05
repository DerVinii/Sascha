import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { contacts, activities } from "@/db/schema";
import { eq, and, gte, sql, isNull, inArray, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { StatusPill } from "@/components/crm/status-pill";

function formatDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export default async function DashboardPage() {
  const org = await requireActiveOrg();
  const orgId = org.id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Parallel queries für KPIs
  const [
    [leadsThisMonth],
    [openLeads],
    [meetingsBooked],
    [openTasks],
    [overdueTasks],
    [activeContacts],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.status, "lead"),
          gte(contacts.createdAt, monthStart),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.status, "lead"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(eq(contacts.orgId, orgId), eq(contacts.status, "meeting_booked")),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(and(eq(activities.orgId, orgId), isNull(activities.completedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(
        and(
          eq(activities.orgId, orgId),
          isNull(activities.completedAt),
          sql`${activities.dueDate} < now()`,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          inArray(contacts.status, [
            "lead",
            "qualified",
            "in_conversation",
            "meeting_booked",
          ]),
        ),
      ),
  ]);

  // Heute fällige Aufgaben (Limit 5)
  const todayTasks = await db
    .select({
      id: activities.id,
      title: activities.title,
      type: activities.type,
      dueDate: activities.dueDate,
      contactId: activities.contactId,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .where(
      and(
        eq(activities.orgId, orgId),
        isNull(activities.completedAt),
        sql`${activities.dueDate} < (current_date + interval '1 day')`,
      ),
    )
    .orderBy(activities.dueDate)
    .limit(5);

  // Letzte Lead-Aktivität (neueste Kontakte)
  const recentContacts = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      status: contacts.status,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(eq(contacts.orgId, orgId))
    .orderBy(desc(contacts.createdAt))
    .limit(5);

  const kpis = [
    {
      label: "Leads diesen Monat",
      value: leadsThisMonth.count,
      href: "/vertrieb",
    },
    {
      label: "Offene Leads",
      value: openLeads.count,
      href: "/vertrieb",
    },
    {
      label: "Termine gebucht",
      value: meetingsBooked.count,
      href: "/crm?status=meeting_booked",
    },
    {
      label: "Offene Aufgaben",
      value: openTasks.count,
      sub:
        overdueTasks.count > 0
          ? `${overdueTasks.count} überfällig`
          : undefined,
      subAccent: overdueTasks.count > 0 ? "err" : undefined,
      href: "/aufgaben",
    },
    {
      label: "Aktive Kontakte",
      value: activeContacts.count,
      sub: "exkl. Won/Lost",
      href: "/crm",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">
          Willkommen zurück
        </h2>
        <p className="text-xs text-sub mt-0.5">
          Übersicht für{" "}
          {new Intl.DateTimeFormat("de-DE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(now)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="rounded-xl border border-line bg-surface p-4 md:p-5 hover:border-sub transition group"
          >
            <div className="text-[11px] md:text-xs font-medium text-sub">
              {kpi.label}
            </div>
            <div className="mt-1.5 md:mt-2 text-xl md:text-2xl font-semibold text-ink">
              {kpi.value}
            </div>
            <div
              className={`mt-1.5 md:mt-2 text-[10px] md:text-xs ${
                kpi.subAccent === "err" ? "text-err" : "text-sub"
              }`}
            >
              {kpi.sub ?? "Details ansehen"}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Letzte Aktivität */}
        <div className="rounded-xl border border-line bg-surface">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Letzte Kontakte</div>
              <div className="text-xs text-sub">Neueste Anlage zuerst</div>
            </div>
            <Link
              href="/crm"
              className="text-xs text-sub hover:text-ink inline-flex items-center gap-1"
            >
              Alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentContacts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-sub text-center">
              Noch keine Kontakte.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recentContacts.map((c) => {
                const name =
                  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  "(ohne Namen)";
                return (
                  <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <StatusPill status={c.status} />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/crm/${c.id}`}
                        className="text-sm font-medium text-ink hover:underline truncate block"
                      >
                        {name}
                      </Link>
                      <div className="text-xs text-sub">
                        Angelegt am {formatDate(c.createdAt)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Heute fällige Aufgaben */}
        <div className="rounded-xl border border-line bg-surface">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Heute fällig</div>
              <div className="text-xs text-sub">
                Aufgaben mit Fälligkeit ≤ heute
              </div>
            </div>
            <Link
              href="/aufgaben"
              className="text-xs text-sub hover:text-ink inline-flex items-center gap-1"
            >
              Alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="px-5 py-8 text-sm text-sub text-center">
              Nichts fällig — entspann dich.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {todayTasks.map((t) => {
                const contactName = t.contactId
                  ? [t.contactFirst, t.contactLast]
                      .filter(Boolean)
                      .join(" ") || "(ohne Namen)"
                  : null;
                const overdue =
                  t.dueDate && t.dueDate.getTime() < Date.now();
                return (
                  <li key={t.id} className="px-5 py-3 flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        overdue ? "bg-err" : "bg-warn"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href="/aufgaben"
                        className="text-sm font-medium text-ink hover:underline truncate block"
                      >
                        {t.title}
                      </Link>
                      <div className="text-xs text-sub">
                        {t.dueDate ? formatDate(t.dueDate) : "ohne Datum"}
                        {contactName && t.contactId && (
                          <>
                            {" · "}
                            <Link
                              href={`/crm/${t.contactId}`}
                              className="text-info hover:underline"
                            >
                              {contactName}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
