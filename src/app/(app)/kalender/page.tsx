import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { activities, calendarEvents, contacts } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  addMonths,
  parseMonthParam,
  type CalendarEventType,
  type CalendarItem,
} from "@/lib/kalender";
import { getGoogleAccount } from "@/lib/server/google/oauth";
import { CalendarView } from "./_components/calendar-view";
import { GoogleSyncBar } from "./_components/google-sync-bar";

export const dynamic = "force-dynamic";

// CRM-Aktivitätstypen → Kalender-Typen (activity_type kennt follow_up/note).
const ACTIVITY_TYPE_MAP: Record<string, CalendarEventType> = {
  meeting: "meeting",
  call: "call",
  task: "task",
  follow_up: "reminder",
  note: "other",
};

function contactName(first: string | null, last: string | null): string | null {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || null;
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const org = await requireActiveOrg();
  const sp = await searchParams;
  const today = new Date();
  const { year, month } = parseMonthParam(sp.m, today);
  const anchor = new Date(year, month, 1);

  // Lade-Fenster: Ankermonat ±2 Monate (5 Monate) — der Client navigiert darin
  // ohne Reload; außerhalb wird ?m= neu gesetzt und neu geladen.
  const windowStart = addMonths(anchor, -2);
  const windowEnd = addMonths(anchor, 3); // exklusiv: erster Tag Anker+3

  const [eventRows, activityRows, contactRows] = await Promise.all([
    db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        type: calendarEvents.type,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        allDay: calendarEvents.allDay,
        location: calendarEvents.location,
        description: calendarEvents.description,
        contactId: calendarEvents.contactId,
        contactFirst: contacts.firstName,
        contactLast: contacts.lastName,
      })
      .from(calendarEvents)
      .leftJoin(contacts, eq(calendarEvents.contactId, contacts.id))
      .where(
        and(
          eq(calendarEvents.orgId, org.id),
          gte(calendarEvents.startAt, windowStart),
          lt(calendarEvents.startAt, windowEnd),
        ),
      ),
    db
      .select({
        id: activities.id,
        title: activities.title,
        type: activities.type,
        dueDate: activities.dueDate,
        body: activities.body,
        contactId: activities.contactId,
        contactFirst: contacts.firstName,
        contactLast: contacts.lastName,
      })
      .from(activities)
      .leftJoin(contacts, eq(activities.contactId, contacts.id))
      .where(
        and(
          eq(activities.orgId, org.id),
          isNull(activities.completedAt),
          gte(activities.dueDate, windowStart),
          lt(activities.dueDate, windowEnd),
        ),
      ),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.orgId, org.id))
      .orderBy(desc(contacts.createdAt))
      .limit(400),
  ]);

  const eventItems: CalendarItem[] = eventRows.map((r) => ({
    id: r.id,
    source: "event",
    title: r.title,
    type: r.type,
    start: r.startAt.toISOString(),
    end: r.endAt ? r.endAt.toISOString() : null,
    allDay: r.allDay,
    location: r.location,
    description: r.description,
    contactId: r.contactId,
    contactName: contactName(r.contactFirst, r.contactLast),
  }));

  const activityItems: CalendarItem[] = activityRows
    .filter((r) => r.dueDate)
    .map((r) => ({
      id: r.id,
      source: "activity",
      title: r.title,
      type: ACTIVITY_TYPE_MAP[r.type] ?? "other",
      // Aufgaben als Tagesmarker (ohne Uhrzeit) — Fälligkeit ist oft datumsgenau.
      start: (r.dueDate as Date).toISOString(),
      end: null,
      allDay: true,
      location: null,
      description: r.body,
      contactId: r.contactId,
      contactName: contactName(r.contactFirst, r.contactLast),
    }));

  const items = [...eventItems, ...activityItems];

  const contactOptions = contactRows.map((c) => ({
    id: c.id,
    name: contactName(c.firstName, c.lastName) ?? "(ohne Namen)",
  }));

  const googleAccount = await getGoogleAccount(org.id);

  return (
    <div>
      <div className="px-4 pt-4 md:px-6">
        <GoogleSyncBar
          connected={Boolean(googleAccount)}
          lastSyncedAt={
            googleAccount?.lastSyncedAt
              ? googleAccount.lastSyncedAt.toISOString()
              : null
          }
        />
      </div>
      <CalendarView
        items={items}
        contactOptions={contactOptions}
        anchorMonth={`${year}-${String(month + 1).padStart(2, "0")}`}
        todayIso={today.toISOString()}
      />
    </div>
  );
}
