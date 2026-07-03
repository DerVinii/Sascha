"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import type { CalendarEventType } from "@/lib/kalender";

const VALID_TYPES: CalendarEventType[] = [
  "meeting",
  "call",
  "task",
  "reminder",
  "other",
];

export type EventInput = {
  title: string;
  type: CalendarEventType;
  /** ISO-8601 — im Client aus lokalen Datum/Zeit-Feldern gebaut. */
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  contactId: string | null;
};

function normalize(input: EventInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Bitte einen Titel angeben.");
  const type = VALID_TYPES.includes(input.type) ? input.type : "other";

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new Error("Ungültiges Startdatum.");

  let end: Date | null = null;
  if (input.endAt) {
    const e = new Date(input.endAt);
    if (!Number.isNaN(e.getTime())) {
      // Ende vor Start ignorieren (statt speichern).
      end = e.getTime() > start.getTime() ? e : null;
    }
  }

  return {
    title,
    type,
    startAt: start,
    endAt: end,
    allDay: Boolean(input.allDay),
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
    contactId: input.contactId || null,
  };
}

export async function createEventAction(input: EventInput): Promise<void> {
  const org = await requireActiveOrg();
  const v = normalize(input);
  await db.insert(calendarEvents).values({ orgId: org.id, ...v });
  revalidatePath("/kalender");
}

export async function updateEventAction(
  id: string,
  input: EventInput,
): Promise<void> {
  const org = await requireActiveOrg();
  const v = normalize(input);
  await db
    .update(calendarEvents)
    .set(v)
    .where(and(eq(calendarEvents.orgId, org.id), eq(calendarEvents.id, id)));
  revalidatePath("/kalender");
}

export async function deleteEventAction(id: string): Promise<void> {
  const org = await requireActiveOrg();
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.orgId, org.id), eq(calendarEvents.id, id)));
  revalidatePath("/kalender");
}
