import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Web-Push (Systembenachrichtigungen). Läuft nur im Node-Runtime.
 * Aktiv, sobald die VAPID-Umgebungsvariablen gesetzt sind:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:info@example.com";

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch {
    configured = false;
  }
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getPublicVapidKey(): string | null {
  return PUBLIC_KEY ?? null;
}

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function saveSubscription(
  orgId: string,
  sub: PushSub,
  userAgent: string | null,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      orgId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        orgId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
    });
}

export async function deleteSubscription(
  orgId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.orgId, orgId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function countSubscriptions(orgId: string): Promise<number> {
  const rows = await db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.orgId, orgId));
  return rows.length;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/**
 * Sendet eine Benachrichtigung an alle Geräte der Org. Best-effort:
 * Fehler brechen den aufrufenden Flow nie ab; abgelaufene Abos (404/410)
 * werden automatisch entfernt.
 */
export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload,
): Promise<void> {
  if (!configured) return;

  const subs = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.orgId, orgId));

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          // Abo ist tot (Gerät/Browser abgemeldet) → aufräumen.
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, s.endpoint))
            .catch(() => {});
        } else {
          console.error("push send failed", statusCode, err);
        }
      }
    }),
  );
}
