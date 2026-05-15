import Link from "next/link";
import { Phone, Calendar, ClipboardList, Send, FileText } from "lucide-react";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, and, asc, isNull, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { NewActivityModal } from "./_components/new-activity-modal";
import { ActivityToggle } from "./_components/activity-toggle";
import type { ActivityType } from "./actions";

const TYPE_LABELS: Record<ActivityType, string> = {
  task: "Aufgabe",
  call: "Anruf",
  meeting: "Termin",
  follow_up: "Follow-up",
  note: "Notiz",
};

const TYPE_ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  task: ClipboardList,
  call: Phone,
  meeting: Calendar,
  follow_up: Send,
  note: FileText,
};

function formatDateTime(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isOverdue(d: Date | null, completed: boolean) {
  if (!d || completed) return false;
  return d.getTime() < Date.now();
}

function isToday(d: Date | null) {
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default async function AufgabenPage() {
  const org = await requireActiveOrg();

  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      title: activities.title,
      body: activities.body,
      dueDate: activities.dueDate,
      completedAt: activities.completedAt,
      contactId: activities.contactId,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .where(eq(activities.orgId, org.id))
    .orderBy(
      // erledigte ans Ende, dann nach due_date
      sql`${activities.completedAt} IS NOT NULL`,
      asc(activities.dueDate),
    )
    .limit(500);

  const open = rows.filter((a) => !a.completedAt);
  const overdue = open.filter((a) => isOverdue(a.dueDate, false));
  const today = open.filter((a) => isToday(a.dueDate));
  const upcoming = open.filter(
    (a) => !isOverdue(a.dueDate, false) && !isToday(a.dueDate),
  );
  const done = rows.filter((a) => a.completedAt);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Aufgaben</h2>
          <p className="text-xs text-sub mt-0.5">
            {open.length} offen · {done.length} erledigt
          </p>
        </div>
        <NewActivityModal />
      </div>

      <Section title="Überfällig" items={overdue} accent="err" />
      <Section title="Heute fällig" items={today} accent="warn" />
      <Section title="Kommend" items={upcoming} accent="info" />
      {done.length > 0 && (
        <Section title="Erledigt" items={done.slice(0, 20)} accent="ok" />
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-12 text-center">
          <p className="text-sm text-sub">Keine Aufgaben angelegt.</p>
          <p className="text-xs text-sub mt-1">
            Lege oben rechts deine erste Aufgabe an oder erstelle sie aus einem
            Kontakt heraus.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  accent,
}: {
  title: string;
  items: {
    id: string;
    type: ActivityType;
    title: string;
    body: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    contactId: string | null;
    contactFirst: string | null;
    contactLast: string | null;
  }[];
  accent: "err" | "warn" | "info" | "ok";
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-line bg-bg flex items-center gap-2`}>
        <span
          className={`h-2 w-2 rounded-full bg-${accent}`}
          aria-hidden
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
          {title}
        </h3>
        <span className="text-[11px] text-sub">{items.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((a) => {
          const Icon = TYPE_ICONS[a.type];
          const completed = Boolean(a.completedAt);
          const contactName = a.contactId
            ? [a.contactFirst, a.contactLast].filter(Boolean).join(" ") ||
              "(ohne Namen)"
            : null;
          return (
            <li key={a.id} className="px-4 py-3 flex items-center gap-3">
              <ActivityToggle activityId={a.id} completed={completed} />
              <Icon className="h-4 w-4 text-sub shrink-0" />
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-medium ${completed ? "text-sub line-through" : "text-ink"}`}
                >
                  {a.title}
                </div>
                <div className="text-[11px] text-sub mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="pill bg-bg text-sub">
                    {TYPE_LABELS[a.type]}
                  </span>
                  {a.dueDate && (
                    <span>{formatDateTime(a.dueDate)}</span>
                  )}
                  {contactName && a.contactId && (
                    <Link
                      href={`/crm/${a.contactId}`}
                      className="text-info hover:underline"
                    >
                      → {contactName}
                    </Link>
                  )}
                </div>
                {a.body && (
                  <p className="text-xs text-sub mt-1 line-clamp-2">{a.body}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
