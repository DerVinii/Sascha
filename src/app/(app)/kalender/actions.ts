"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import type { CalendarEventType } from "@/lib/kalender";
import {
  disconnectGoogle,
  getGoogleAccount,
} from "@/lib/server/google/oauth";
import {
  pullFromGoogle,
  pushCreateToGoogle,
  pushDeleteToGoogle,
  pushUpdateToGoogle,
  type PullResult,
} from "@/lib/server/google/calendar";

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
  const [row] = await db
    .insert(calendarEvents)
    .values({ orgId: org.id, ...v })
    .returning({ id: calendarEvents.id });

  // App → Google: Termin bei verbundenem Konto anlegen, ID zurückschreiben.
  const account = await getGoogleAccount(org.id);
  if (account && row) {
    try {
      const googleEventId = await pushCreateToGoogle(account, v);
      await db
        .update(calendarEvents)
        .set({ googleEventId })
        .where(eq(calendarEvents.id, row.id));
    } catch (e) {
      console.error("[google] Push (create) fehlgeschlagen:", e);
    }
  }
  revalidatePath("/kalender");
}

export async function updateEventAction(
  id: string,
  input: EventInput,
): Promise<void> {
  const org = await requireActiveOrg();
  const v = normalize(input);
  const [row] = await db
    .update(calendarEvents)
    .set(v)
    .where(and(eq(calendarEvents.orgId, org.id), eq(calendarEvents.id, id)))
    .returning({ googleEventId: calendarEvents.googleEventId });

  const account = await getGoogleAccount(org.id);
  if (account && row) {
    try {
      if (row.googleEventId) {
        await pushUpdateToGoogle(account, row.googleEventId, v);
      } else {
        // Lokal entstandener Termin wird beim ersten Edit nach Google gehoben.
        const googleEventId = await pushCreateToGoogle(account, v);
        await db
          .update(calendarEvents)
          .set({ googleEventId })
          .where(eq(calendarEvents.id, id));
      }
    } catch (e) {
      console.error("[google] Push (update) fehlgeschlagen:", e);
    }
  }
  revalidatePath("/kalender");
}

export async function deleteEventAction(id: string): Promise<void> {
  const org = await requireActiveOrg();
  const [row] = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.orgId, org.id), eq(calendarEvents.id, id)))
    .returning({ googleEventId: calendarEvents.googleEventId });

  const account = await getGoogleAccount(org.id);
  if (account && row?.googleEventId) {
    try {
      await pushDeleteToGoogle(account, row.googleEventId);
    } catch (e) {
      console.error("[google] Push (delete) fehlgeschlagen:", e);
    }
  }
  revalidatePath("/kalender");
}

/** Manueller/automatischer Abgleich Google → App (aus dem Kalender-UI). */
export async function syncGoogleAction(): Promise<PullResult> {
  const org = await requireActiveOrg();
  const result = await pullFromGoogle(org.id);
  revalidatePath("/kalender");
  return result;
}

/** Google-Verbindung trennen (Tokens löschen). Lokale Termine bleiben. */
export async function disconnectGoogleAction(): Promise<void> {
  const org = await requireActiveOrg();
  await disconnectGoogle(org.id);
  revalidatePath("/kalender");
  revalidatePath("/einstellungen/kalender");
}
