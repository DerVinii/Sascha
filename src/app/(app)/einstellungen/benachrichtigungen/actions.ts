"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/server/active-org";
import { setOrgSettingsKey } from "@/lib/server/org-settings";
import {
  parsePushEventPrefs,
  type PushEventPrefs,
} from "@/lib/notification-events";
import {
  saveSubscription,
  deleteSubscription,
  sendPushToOrg,
  isPushConfigured,
  getPublicVapidKey,
  type PushSub,
} from "@/lib/server/push";

export async function getPushConfigAction(): Promise<{
  configured: boolean;
  publicKey: string | null;
}> {
  return {
    configured: await isPushConfigured(),
    publicKey: await getPublicVapidKey(),
  };
}

export async function subscribePushAction(sub: PushSub): Promise<void> {
  const org = await requireActiveOrg();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Ungültiges Push-Abo.");
  }
  const ua = (await headers()).get("user-agent");
  await saveSubscription(org.id, sub, ua);
}

export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const org = await requireActiveOrg();
  if (!endpoint) return;
  await deleteSubscription(org.id, endpoint);
}

/**
 * Auswahl speichern, welche Ereignisse eine Benachrichtigung auslösen.
 * `parsePushEventPrefs` filtert dabei alles heraus, was nicht im Katalog steht —
 * in die Org-Settings kommen nur bekannte Keys mit echtem Boolean.
 */
export async function savePushEventsAction(
  prefs: PushEventPrefs,
): Promise<void> {
  const org = await requireActiveOrg();
  await setOrgSettingsKey(org.id, "pushEvents", parsePushEventPrefs(prefs));
  revalidatePath("/einstellungen/benachrichtigungen");
}

export async function sendTestNotificationAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const org = await requireActiveOrg();
  if (!(await isPushConfigured())) {
    return {
      ok: false,
      message:
        "Push-Schlüssel konnten nicht geladen werden. Bitte später erneut versuchen.",
    };
  }
  await sendPushToOrg(org.id, {
    title: "Testbenachrichtigung",
    body: "Wenn du das siehst, funktionieren die Benachrichtigungen. 🎉",
    url: "/dashboard",
    tag: "test",
  });
  return { ok: true, message: "Testbenachrichtigung wurde gesendet." };
}
