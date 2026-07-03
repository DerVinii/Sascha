/**
 * Instantly-Webhook-Empfänger (reply_received u. a.).
 *
 * Auth: Instantly kann Webhook-Deliveries nicht signieren — der Webhook wird
 * bei Instantly mit einem Custom-Header registriert (x-webhook-secret), den
 * wir hier gegen INSTANTLY_WEBHOOK_SECRET prüfen.
 *
 * Wichtig: Nach bestandener Auth antworten wir auch bei Verarbeitungsfehlern
 * mit 200 — Instantly deaktiviert Webhooks nach wiederholten Zustellfehlern
 * (Status -1), und der Poll-Backfill fängt verpasste Events ohnehin auf.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getActiveOrg } from "@/lib/server/active-org";
import { getEmail } from "@/lib/server/instantly/client";
import {
  syncInstantlyEmails,
  upsertInstantlyEmails,
} from "@/lib/server/instantly/sync";
import { sendPushToOrg } from "@/lib/server/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, service: "instantly-webhook" });
}

export async function POST(req: NextRequest) {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET?.trim();
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const org = await getActiveOrg();
  if (!org) {
    return NextResponse.json({ error: "no org" }, { status: 503 });
  }

  try {
    const emailId =
      typeof payload?.email_id === "string" ? payload.email_id : null;
    if (emailId) {
      // Autoritatives Objekt holen statt den Payload-Feldern zu vertrauen
      // (email_id ist laut Doku direkt als reply_to_uuid nutzbar).
      const raw = await getEmail(emailId);
      const campaignNames =
        typeof payload?.campaign_name === "string" && raw.campaign_id
          ? new Map([[raw.campaign_id, payload.campaign_name]])
          : undefined;
      await upsertInstantlyEmails(org.id, [raw], campaignNames);
    } else {
      // Event ohne email_id (Status-Events, Test-Deliveries) → Mini-Backfill.
      await syncInstantlyEmails(org.id, { maxPages: 1 });
    }
  } catch (err) {
    console.error(
      "instantly-webhook: Verarbeitung fehlgeschlagen",
      payload?.event_type,
      err,
    );
  }

  // Push-Benachrichtigung bei eingehenden Antworten (Lead reagiert).
  try {
    const eventType =
      typeof payload?.event_type === "string" ? payload.event_type : "";
    if (eventType.includes("reply")) {
      const leadEmail =
        typeof payload?.lead_email === "string" ? payload.lead_email : null;
      const campaign =
        typeof payload?.campaign_name === "string"
          ? payload.campaign_name
          : null;
      await sendPushToOrg(org.id, {
        title: "Neue Antwort von einem Lead",
        body: [leadEmail, campaign].filter(Boolean).join(" · ") || "Im Postfach ansehen",
        url: "/postfach/unibox",
        tag: "instantly-reply",
      });
    }
  } catch (err) {
    console.error("instantly-webhook: Push fehlgeschlagen", err);
  }

  revalidatePath("/postfach/unibox");
  revalidatePath("/postfach");
  return NextResponse.json({ ok: true });
}
