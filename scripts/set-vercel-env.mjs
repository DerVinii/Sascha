/**
 * Setzt eine Env-Variable im Vercel-Projekt (Upsert: vorhandene Einträge mit
 * gleichem Key werden gelöscht und neu angelegt — vermeidet defekte Einträge,
 * die Vercel beim Deploy still überspringt).
 *
 * Aufruf:  node scripts/set-vercel-env.mjs INSTANTLY_API_KEY
 * Liest VERCEL_TOKEN / VERCEL_PROJECT_ID / VERCEL_ORG_ID und den Wert des
 * angegebenen Keys aus .env.local. Gibt NIE den Wert aus.
 */

import { readFileSync } from "node:fs";

function parseEnv(path) {
  const out = {};
  const txt = readFileSync(path, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const keyName = process.argv[2];
if (!keyName) {
  console.error("Usage: node scripts/set-vercel-env.mjs <ENV_KEY>");
  process.exit(1);
}

const env = parseEnv(".env.local");
const token = env.VERCEL_TOKEN;
const projectId = env.VERCEL_PROJECT_ID;
const teamId = env.VERCEL_ORG_ID;
const value = env[keyName];

if (!token || !projectId) {
  console.error("VERCEL_TOKEN / VERCEL_PROJECT_ID fehlen in .env.local");
  process.exit(1);
}
if (!value) {
  console.error(`${keyName} hat in .env.local keinen Wert`);
  process.exit(1);
}

const q = teamId ? `?teamId=${teamId}` : "";
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

// 1) Vorhandene Einträge mit diesem Key löschen.
const listRes = await fetch(
  `https://api.vercel.com/v9/projects/${projectId}/env${q}`,
  { headers },
);
if (!listRes.ok) {
  console.error("Env-Liste fehlgeschlagen:", listRes.status, await listRes.text());
  process.exit(1);
}
const list = await listRes.json();
const existing = (list.envs ?? []).filter((e) => e.key === keyName);
for (const e of existing) {
  const delQ = teamId ? `?teamId=${teamId}` : "";
  const del = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env/${e.id}${delQ}`,
    { method: "DELETE", headers },
  );
  console.log(`gelöscht: ${keyName} (${e.id}) -> ${del.status}`);
}

// 2) Frisch anlegen (verschlüsselt, alle Targets).
const createRes = await fetch(
  `https://api.vercel.com/v10/projects/${projectId}/env${q}`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      key: keyName,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  },
);
const createBody = await createRes.json();
if (!createRes.ok) {
  console.error("Anlegen fehlgeschlagen:", createRes.status, createBody);
  process.exit(1);
}
console.log(
  `angelegt: ${keyName} (len=${value.length}, targets=production,preview,development) -> ${createRes.status}`,
);
