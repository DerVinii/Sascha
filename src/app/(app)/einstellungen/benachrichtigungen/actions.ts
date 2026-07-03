"use server";

import { headers } from "next/headers";
import { requireActiveOrg } from "@/lib/server/active-org";
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
  return { configured: isPushConfigured(), publicKey: getPublicVapidKey() };
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

export async function sendTestNotificationAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const org = await requireActiveOrg();
  if (!isPushConfigured()) {
    return {
      ok: false,
      message: "Push ist serverseitig nicht konfiguriert (VAPID-Keys fehlen).",
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
