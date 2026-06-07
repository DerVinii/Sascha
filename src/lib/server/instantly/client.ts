/**
 * Schlanker Client für die Instantly.ai v2-API (Cold-Email/Outbound).
 *
 * Nur serverseitig nutzen (liest INSTANTLY_API_KEY). Dieselbe Workspace-Bindung
 * wie die CLI (`npm run instantly`) — der Key gehört zum Workspace "Sascha".
 * Wird ausschließlich aus Server-Actions importiert, nie aus Client-Komponenten.
 */

import type { InstantlyCampaign } from "@/lib/scraping-types";

const BASE =
  process.env.INSTANTLY_API_BASE_URL?.trim() || "https://api.instantly.ai/api/v2";

function apiKey(): string {
  const k = process.env.INSTANTLY_API_KEY?.trim();
  if (!k) {
    throw new Error(
      `INSTANTLY_API_KEY fehlt zur Laufzeit (defined=${
        process.env.INSTANTLY_API_KEY !== undefined
      }, len=${(process.env.INSTANTLY_API_KEY ?? "").length})`,
    );
  }
  return k;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Instantly ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Alle Kampagnen des Workspaces (paginiert, bis ~500). */
export async function listCampaigns(): Promise<InstantlyCampaign[]> {
  const out: InstantlyCampaign[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await call<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[];
      next_starting_after?: string;
    }>(`/campaigns?${qs.toString()}`);
    const items = data.items ?? [];
    for (const c of items) {
      out.push({
        id: c.id,
        name: c.name ?? "(ohne Name)",
        status: typeof c.status === "number" ? c.status : null,
      });
    }
    if (items.length < 100 || !data.next_starting_after) break;
    cursor = data.next_starting_after;
  }
  return out;
}

export type InstantlyAccount = {
  email: string;
  status: number | null;
  warmupScore: number | null;
};

/** Verbundene Absender-Postfächer (paginiert). */
export async function listAccounts(): Promise<InstantlyAccount[]> {
  const out: InstantlyAccount[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await call<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[];
      next_starting_after?: string;
    }>(`/accounts?${qs.toString()}`);
    const items = data.items ?? [];
    for (const a of items) {
      out.push({
        email: a.email,
        status: typeof a.status === "number" ? a.status : null,
        warmupScore:
          typeof a.stat_warmup_score === "number" ? a.stat_warmup_score : null,
      });
    }
    if (items.length < 100 || !data.next_starting_after) break;
    cursor = data.next_starting_after;
  }
  return out;
}

// --- Kampagnen-Sequenz (Copy) ----------------------------------------------

export type InstantlyStepVariant = { subject: string; body: string };
export type InstantlyStep = {
  type: "email";
  delay: number; // Tage vor diesem Schritt (0 = sofort, Follow-up = N Tage)
  variants: InstantlyStepVariant[];
};
export type InstantlySequence = { steps: InstantlyStep[] };

/** Eine Kampagne inkl. Sequenz/Status holen (für Prefill im Assistenten). */
export async function getCampaign(id: string): Promise<{
  id: string;
  name: string;
  status: number | null;
  sequences: InstantlySequence[];
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = await call<any>(`/campaigns/${id}`);
  return {
    id: c.id,
    name: c.name ?? "",
    status: typeof c.status === "number" ? c.status : null,
    sequences: Array.isArray(c.sequences) ? c.sequences : [],
  };
}

export async function createCampaign(input: {
  name: string;
  sequences: InstantlySequence[];
  emailList?: string[];
}): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    name: input.name,
    sequences: input.sequences,
  };
  if (input.emailList?.length) body.email_list = input.emailList;
  const data = await call<{ id: string }>("/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: data.id };
}

export async function updateCampaign(
  id: string,
  input: { name?: string; sequences?: InstantlySequence[]; emailList?: string[] },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.sequences !== undefined) body.sequences = input.sequences;
  if (input.emailList?.length) body.email_list = input.emailList;
  await call(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function activateCampaign(id: string): Promise<void> {
  await call(`/campaigns/${id}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type InstantlyLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  phone?: string;
  custom_variables?: Record<string, string>;
};

/**
 * Leads in eine Kampagne einspielen (bis zu 1000/Call).
 * `skipIfInCampaign` lässt Instantly selbst deduplizieren.
 */
export async function bulkAddLeads(
  campaignId: string,
  leads: InstantlyLead[],
  opts?: { skipIfInCampaign?: boolean; skipIfInWorkspace?: boolean },
): Promise<unknown> {
  // Endpoint der v2-CLI für "leads bulk-add" ist POST /leads/add (nicht /leads/bulk-add).
  return call("/leads/add", {
    method: "POST",
    body: JSON.stringify({
      campaign_id: campaignId,
      leads,
      skip_if_in_campaign: opts?.skipIfInCampaign ?? true,
      skip_if_in_workspace: opts?.skipIfInWorkspace ?? false,
    }),
  });
}
