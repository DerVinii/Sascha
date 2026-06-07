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
    if (!data.next_starting_after || items.length === 0) break;
    cursor = data.next_starting_after;
  }
  return out;
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
  return call("/leads/bulk-add", {
    method: "POST",
    body: JSON.stringify({
      campaign_id: campaignId,
      leads,
      skip_if_in_campaign: opts?.skipIfInCampaign ?? true,
      skip_if_in_workspace: opts?.skipIfInWorkspace ?? false,
    }),
  });
}
