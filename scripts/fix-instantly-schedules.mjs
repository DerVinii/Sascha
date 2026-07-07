/**
 * Bestehende Instantly-Kampagnen auf den Standard-Schedule ziehen:
 * Mo–Fr 08:00–16:00, Zeitzone Europe/Belgrade (= CET/CEST wie Berlin; Instantly
 * bietet kein "Europe/Berlin" an). Verschickt nichts — ändert nur den Zeitplan.
 *
 * Idempotent. Aufruf: node scripts/fix-instantly-schedules.mjs   (Netz → Sandbox aus)
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const KEY = env.INSTANTLY_API_KEY;
const BASE =
  env.INSTANTLY_API_BASE_URL?.trim() || "https://api.instantly.ai/api/v2";
if (!KEY) {
  console.error("INSTANTLY_API_KEY fehlt");
  process.exit(1);
}

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "sk-kommandozentrale/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const SCHEDULE = {
  schedules: [
    {
      name: "Default schedule",
      timing: { from: "08:00", to: "16:00" },
      days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
      timezone: "Europe/Belgrade",
    },
  ],
};

// Alle Kampagnen paginiert holen.
const all = [];
let cursor;
for (let p = 0; p < 10; p++) {
  const qs = new URLSearchParams({ limit: "100" });
  if (cursor) qs.set("starting_after", cursor);
  const data = await call(`/campaigns?${qs.toString()}`);
  const items = data.items ?? [];
  all.push(...items);
  if (items.length < 100 || !data.next_starting_after) break;
  cursor = data.next_starting_after;
}

console.log(`Kampagnen gesamt: ${all.length}\n`);
let changed = 0;
for (const c of all) {
  const s = c.campaign_schedule?.schedules?.[0];
  const before = s
    ? `${s.timing?.from}–${s.timing?.to} ${s.timezone}`
    : "(kein Schedule)";
  const already =
    s?.timing?.from === "08:00" &&
    s?.timing?.to === "16:00" &&
    s?.timezone === "Europe/Belgrade";
  if (already) {
    console.log(`= ${c.name}: bereits 08:00–16:00 Europe/Belgrade`);
    continue;
  }
  try {
    await call(`/campaigns/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ campaign_schedule: SCHEDULE }),
    });
    console.log(`✓ ${c.name}: ${before}  →  08:00–16:00 Europe/Belgrade`);
    changed++;
  } catch (e) {
    console.log(`✗ ${c.name}: FEHLER ${e.message}`);
  }
}
console.log(`\nGeändert: ${changed} / ${all.length}`);
