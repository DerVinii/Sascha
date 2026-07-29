import webpush from "web-push";
import { db } from "@/db";
import { pushKeys, pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Web-Push (Systembenachrichtigungen). Läuft nur im Node-Runtime.
 *
 * Die VAPID-Schlüssel kommen aus den Umgebungsvariablen VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY / VAPID_SUBJECT — und wenn dort nichts (Brauchbares) steht,
 * aus der Tabelle `push_keys`. Ist auch die leer, erzeugt der Server beim ersten
 * Zugriff selbst ein Paar und legt es ab. Damit lässt sich Push in jeder
 * Umgebung sofort aktivieren, ohne dass jemand Variablen in Vercel nachträgt —
 * genau daran ist es vorher gescheitert.
 */

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const ENV_PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim();
const ENV_PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim();
const ENV_SUBJECT = process.env.VAPID_SUBJECT?.trim();

/**
 * Kontaktadresse im VAPID-Header. Die Push-Dienste (Google, Mozilla, Apple)
 * verlangen eine echte mailto:- oder https-Adresse, um bei Auffälligkeiten den
 * Absender erreichen zu können — ein Platzhalter kann Zustellprobleme machen.
 */
function defaultSubject(): string {
  const mail = process.env.POSTFACH_EMAIL?.trim();
  return mail ? `mailto:${mail}` : "mailto:info@sk-dozentundcoach.de";
}

/**
 * Prüft ein Schlüsselpaar, indem es web-push selbst validieren lässt (Format,
 * Länge, gültiges Subject). Ein kaputt eingetragener Wert soll Push nicht
 * lahmlegen, sondern nur ignoriert werden.
 */
function validate(keys: VapidKeys): VapidKeys | null {
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    return keys;
  } catch (err) {
    console.error("VAPID-Schlüssel ungültig", err);
    return null;
  }
}

/** Einmal geladen, dann für die Lebensdauer der Instanz gemerkt. */
let cached: VapidKeys | null = null;

async function loadStoredKeys(): Promise<VapidKeys | null> {
  const [row] = await db
    .select({
      publicKey: pushKeys.publicKey,
      privateKey: pushKeys.privateKey,
      subject: pushKeys.subject,
    })
    .from(pushKeys)
    .limit(1);
  if (!row) return null;
  return validate({
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    subject: ENV_SUBJECT || row.subject || defaultSubject(),
  });
}

export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cached) return cached;

  if (ENV_PUBLIC && ENV_PRIVATE) {
    const fromEnv = validate({
      publicKey: ENV_PUBLIC,
      privateKey: ENV_PRIVATE,
      subject: ENV_SUBJECT || defaultSubject(),
    });
    if (fromEnv) {
      cached = fromEnv;
      return cached;
    }
  }

  try {
    const stored = await loadStoredKeys();
    if (stored) {
      cached = stored;
      return cached;
    }

    // Noch kein Paar in der DB → eines erzeugen. Einfügen ohne Konflikt und
    // danach erneut lesen: Starten zwei Instanzen gleichzeitig, gewinnt genau
    // ein Paar, und beide arbeiten anschließend mit demselben.
    const generated = webpush.generateVAPIDKeys();
    await db
      .insert(pushKeys)
      .values({
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject: ENV_SUBJECT || defaultSubject(),
      })
      .onConflictDoNothing();
    cached = await loadStoredKeys();
    return cached;
  } catch (err) {
    console.error("VAPID-Schlüssel konnten nicht geladen werden", err);
    return null;
  }
}

export async function isPushConfigured(): Promise<boolean> {
  return (await getVapidKeys()) !== null;
}

export async function getPublicVapidKey(): Promise<string | null> {
  return (await getVapidKeys())?.publicKey ?? null;
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
  const keys = await getVapidKeys();
  if (!keys) return;

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
          { vapidDetails: keys },
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
