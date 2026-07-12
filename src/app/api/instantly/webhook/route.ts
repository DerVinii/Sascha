/**
 * Instantly-Webhook-Empfänger (reply_received, email_sent, campaign_completed,
 * lead_interested, lead_not_interested — je Event ein eigener Webhook bei
 * Instantly, alle zeigen auf diese Route).
 *
 * Auth: Instantly kann Webhook-Deliveries nicht signieren — der Webhook wird
 * bei Instantly mit einem Custom-Header registriert (x-webhook-secret), den
 * wir hier gegen INSTANTLY_WEBHOOK_SECRET prüfen.
 *
 * Wichtig: Nach bestandener Auth antworten wir auch bei Verarbeitungsfehlern
 * mit 200 — Instantly deaktiviert Webhooks nach wiederholten Zustellfehlern
 * (Status -1), und der Poll-Backfill fängt verpasste Events ohnehin auf.
 *
 * Zwei Aufgaben:
 *  1) Unibox-Spiegel: Antworten (reply_*) in instantly_emails upserten.
 *  2) Pipeline-Automatik: Events auf Pipeline-Phasen der Ordner-Leads mappen
 *     (siehe EVENT_STAGE + pipeline-auto.ts; nur vorwärts, manuelle Phasen tabu).
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
import {
  autoAdvanceByInstantlyEvent,
  type AutoStageName,
} from "@/lib/server/pipeline-auto";

export const dynamic = "force-dynamic";

/**
 * Event → Ziel-Phase der Pipeline-Automatik.
 *  - email_sent: Instantly hat (irgendeine) Mail an den Lead gesendet →
 *    "angeschrieben" (Follow-ups stufen dank Vorwärts-Regel nie zurück).
 *  - campaign_completed: Sequenz für den Lead fertig → "Kampagne fertig".
 *  - reply_received / lead_interested: Antwort (unklassifiziert oder
 *    Interessiert) → "geantwortet".
 *  - lead_not_interested: als "kein Interesse" eingestuft → "Lost".
 * auto_reply_received (Abwesenheitsnotizen) ist bewusst NICHT gemappt.
 */
const EVENT_STAGE: Record<string, AutoStageName> = {
  email_sent: "angeschrieben",
  campaign_completed: "Kampagne fertig",
  reply_received: "geantwortet",
  lead_interested: "geantwortet",
  lead_not_interested: "Lost",
};

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

  const eventType =
    typeof payload?.event_type === "string" ? payload.event_type : "";
  const stageTarget = EVENT_STAGE[eventType];

  // Reine Status-Events (email_sent, campaign_completed, lead_*) brauchen
  // keinen Unibox-Sync — Mail-Inhalte kommen weiterhin über reply_received.
  // Spart bei jeder gesendeten Mail einen Instantly-API-Call (Rate-Limit).
  const skipUniboxSync = Boolean(stageTarget) && eventType !== "reply_received";

  try {
    const emailId =
      typeof payload?.email_id === "string" ? payload.email_id : null;
    if (skipUniboxSync) {
      // nichts zu spiegeln
    } else if (emailId) {
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

  // Pipeline-Automatik: Lead über Kampagne + Versand-Adresse auflösen und
  // seine Pipeline-Phase vorwärts schieben (Ordner muss verbunden sein).
  try {
    const campaignId =
      typeof payload?.campaign_id === "string" ? payload.campaign_id : null;
    const leadEmail =
      typeof payload?.lead_email === "string" ? payload.lead_email : null;
    if (stageTarget && campaignId && leadEmail) {
      const moved = await autoAdvanceByInstantlyEvent(
        org.id,
        campaignId,
        leadEmail,
        stageTarget,
      );
      if (moved > 0) {
        revalidatePath("/vertrieb/scraping");
        revalidatePath("/pipelines", "layout");
      }
    }
  } catch (err) {
    console.error(
      "instantly-webhook: Pipeline-Automatik fehlgeschlagen",
      payload?.event_type,
      err,
    );
  }

  // Push-Benachrichtigung bei eingehenden Antworten (Lead reagiert).
  try {
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
