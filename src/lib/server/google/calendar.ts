/**
 * Google-Calendar-Sync-Engine.
 *
 *  - pullFromGoogle:  Google → App. Inkrementell über `syncToken`; importierte
 *                     Termine landen als calendar_events-Zeilen mit gesetztem
 *                     google_event_id (tauchen dadurch direkt im Kalender auf).
 *  - push*ToGoogle:   App → Google. Von den Server-Actions aufgerufen, wenn ein
 *                     Termin lokal angelegt/geändert/gelöscht wird.
 *
 * Direkte REST-Aufrufe (fetch) gegen die Calendar-v3-API — kein googleapis-SDK,
 * passend zum schlanken Stil des Projekts.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, googleAccounts } from "@/db/schema";
import type { CalendarEventType } from "@/lib/kalender";
import { CALENDAR_TIMEZONE, GOOGLE_CAL_BASE } from "./config";
import {
  getGoogleAccount,
  getValidAccessToken,
  type GoogleAccount,
} from "./oauth";

const VALID_TYPES: CalendarEventType[] = [
  "meeting",
  "call",
  "task",
  "reminder",
  "other",
];

type LocalEvent = {
  title: string;
  description: string | null;
  type: CalendarEventType;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

// ---------------------------------------------------------------------------
// REST-Helfer
// ---------------------------------------------------------------------------

async function calFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${GOOGLE_CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function eventToGoogleBody(ev: LocalEvent): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    extendedProperties: { private: { crmType: ev.type } },
  };
  if (ev.allDay) {
    const day = ymd(ev.startAt);
    const endDay = ev.endAt ? ymd(ev.endAt) : ymd(addDays(ev.startAt, 1));
    body.start = { date: day };
    body.end = { date: endDay };
  } else {
    body.start = { dateTime: ev.startAt.toISOString(), timeZone: CALENDAR_TIMEZONE };
    const end = ev.endAt ?? new Date(ev.startAt.getTime() + 60 * 60 * 1000);
    body.end = { dateTime: end.toISOString(), timeZone: CALENDAR_TIMEZONE };
  }
  return body;
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// App → Google
// ---------------------------------------------------------------------------

/** Legt einen lokalen Termin in Google an; liefert die Google-Event-ID. */
export async function pushCreateToGoogle(
  account: GoogleAccount,
  ev: LocalEvent,
): Promise<string> {
  const token = await getValidAccessToken(account);
  const res = await calFetch(token, `/calendars/${encodeURIComponent(account.calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(eventToGoogleBody(ev)),
  });
  if (!res.ok) throw new Error(`Google-Insert fehlgeschlagen: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as GoogleEvent;
  return data.id;
}

/** Aktualisiert einen bereits verknüpften Termin in Google. */
export async function pushUpdateToGoogle(
  account: GoogleAccount,
  googleEventId: string,
  ev: LocalEvent,
): Promise<void> {
  const token = await getValidAccessToken(account);
  const res = await calFetch(
    token,
    `/calendars/${encodeURIComponent(account.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "PATCH", body: JSON.stringify(eventToGoogleBody(ev)) },
  );
  // 404/410: Termin existiert in Google nicht mehr — kein harter Fehler.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google-Update fehlgeschlagen: ${res.status} ${await res.text()}`);
  }
}

/** Löscht einen verknüpften Termin in Google. */
export async function pushDeleteToGoogle(
  account: GoogleAccount,
  googleEventId: string,
): Promise<void> {
  const token = await getValidAccessToken(account);
  const res = await calFetch(
    token,
    `/calendars/${encodeURIComponent(account.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google-Delete fehlgeschlagen: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Google → App
// ---------------------------------------------------------------------------

function mapGoogleType(ev: GoogleEvent): CalendarEventType {
  const t = ev.extendedProperties?.private?.crmType as CalendarEventType | undefined;
  return t && VALID_TYPES.includes(t) ? t : "meeting";
}

function parseGoogleTimes(ev: GoogleEvent): {
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
} | null {
  if (ev.start?.dateTime) {
    const startAt = new Date(ev.start.dateTime);
    const endAt = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
    if (Number.isNaN(startAt.getTime())) return null;
    return { startAt, endAt, allDay: false };
  }
  if (ev.start?.date) {
    // Ganztägig: auf 12:00 UTC legen, damit die lokale Tageszuordnung stimmt.
    const startAt = new Date(`${ev.start.date}T12:00:00Z`);
    if (Number.isNaN(startAt.getTime())) return null;
    return { startAt, endAt: null, allDay: true };
  }
  return null;
}

export type PullResult = {
  connected: boolean;
  imported: number;
  updated: number;
  deleted: number;
  error?: string;
};

/**
 * Zieht neue/geänderte Termine aus Google in die lokale DB.
 * Inkrementell über den gespeicherten syncToken; bei abgelaufenem Token (410)
 * automatisch voller Neuabgleich.
 */
export async function pullFromGoogle(orgId: string): Promise<PullResult> {
  const account = await getGoogleAccount(orgId);
  if (!account) return { connected: false, imported: 0, updated: 0, deleted: 0 };

  const result: PullResult = { connected: true, imported: 0, updated: 0, deleted: 0 };

  try {
    const token = await getValidAccessToken(account);
    const calId = encodeURIComponent(account.calendarId);
    let syncToken = account.syncToken;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    // Bis zu einer vollen Runde (Paginierung); bei 410 einmal komplett neu.
    let usedFullResync = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "250",
      });
      if (syncToken) {
        params.set("syncToken", syncToken);
      } else {
        // Fenster für den ersten (vollen) Abgleich: -90 … +365 Tage.
        params.set("timeMin", new Date(Date.now() - 90 * 864e5).toISOString());
        params.set("timeMax", new Date(Date.now() + 365 * 864e5).toISOString());
      }
      if (pageToken) params.set("pageToken", pageToken);

      const res = await calFetch(token, `/calendars/${calId}/events?${params.toString()}`);

      if (res.status === 410 && !usedFullResync) {
        // syncToken abgelaufen → voller Neuabgleich von vorne.
        usedFullResync = true;
        syncToken = null;
        pageToken = undefined;
        continue;
      }
      if (!res.ok) {
        throw new Error(`Google-List fehlgeschlagen: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as {
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };

      for (const ev of data.items ?? []) {
        await applyGoogleEvent(orgId, ev, result);
      }

      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
        continue;
      }
      nextSyncToken = data.nextSyncToken;
      break;
    }

    await db
      .update(googleAccounts)
      .set({
        syncToken: nextSyncToken ?? null,
        lastSyncedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(googleAccounts.orgId, orgId));

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    await db
      .update(googleAccounts)
      .set({ lastError: msg.slice(0, 500), lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(googleAccounts.orgId, orgId))
      .catch(() => {});
    return result;
  }
}

/** Ein einzelnes Google-Event in die lokale Tabelle spiegeln. */
async function applyGoogleEvent(
  orgId: string,
  ev: GoogleEvent,
  result: PullResult,
): Promise<void> {
  const existing = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.googleEventId, ev.id)),
    )
    .limit(1);
  const row = existing[0];

  if (ev.status === "cancelled") {
    if (row) {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, row.id));
      result.deleted++;
    }
    return;
  }

  const times = parseGoogleTimes(ev);
  if (!times) return; // Event ohne verwertbare Zeit ignorieren

  const values = {
    title: ev.summary?.trim() || "(ohne Titel)",
    description: ev.description?.trim() || null,
    type: mapGoogleType(ev),
    location: ev.location?.trim() || null,
    startAt: times.startAt,
    endAt: times.endAt,
    allDay: times.allDay,
  };

  if (row) {
    await db.update(calendarEvents).set(values).where(eq(calendarEvents.id, row.id));
    result.updated++;
  } else {
    await db
      .insert(calendarEvents)
      .values({ orgId, googleEventId: ev.id, ...values });
    result.imported++;
  }
}
