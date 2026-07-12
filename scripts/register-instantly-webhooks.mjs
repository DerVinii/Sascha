/**
 * Registriert die Instantly-Webhooks für die Pipeline-Automatik (idempotent).
 *
 * Instantly erlaubt genau EIN Event pro Webhook — deshalb ein Webhook je Event,
 * alle auf dieselbe Route /api/instantly/webhook (Auth via x-webhook-secret,
 * Instantly kann keine Signaturen). Bereits vorhandene Events werden
 * übersprungen; deaktivierte (status -1) werden gemeldet.
 *
 * Aufruf: node scripts/register-instantly-webhooks.mjs
 */
import { readFileSync } from "node:fs";

const TARGET_URL = "https://sascha-wyvernai.vercel.app/api/instantly/webhook";
const EVENTS = [
  "reply_received", // Unibox-Spiegel + Phase "geantwortet"
  "email_sent", // Phase "angeschrieben"
  "campaign_completed", // Phase "Kampagne fertig"
  "lead_interested", // Phase "geantwortet"
  "lead_not_interested", // Phase "Lost"
];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const apiKey = env.INSTANTLY_API_KEY;
const secret = env.INSTANTLY_WEBHOOK_SECRET;
if (!apiKey || !secret) {
  console.error("INSTANTLY_API_KEY oder INSTANTLY_WEBHOOK_SECRET fehlt in .env.local");
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`https://api.instantly.ai/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

try {
  const { items = [] } = await call("/webhooks");
  const existing = new Map(
    items
      .filter((w) => w.target_hook_url === TARGET_URL)
      .map((w) => [w.event_type, w]),
  );

  for (const event of EVENTS) {
    const have = existing.get(event);
    if (have) {
      const state = have.status === 1 ? "aktiv" : `status ${have.status} — bei Instantly reaktivieren!`;
      console.log(`OK: ${event} bereits registriert (${state})`);
      continue;
    }
    await call("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        target_hook_url: TARGET_URL,
        event_type: event,
        name: `SK Kommandozentrale Pipeline (${event})`,
        headers: { "x-webhook-secret": secret },
      }),
    });
    console.log(`NEU: ${event} registriert`);
  }
} catch (e) {
  console.error("Fehler:", e.message);
  process.exitCode = 1;
}
