/**
 * Stößt den Hintergrund-Enrichment-Drain an (server-zu-server-Fetch auf die
 * eigene Route). Absichtlich „fire-and-forget": Die Route antwortet sofort mit
 * 202 und erledigt die Arbeit in ihrem eigenen `after()`. Fällt der Anstoß aus,
 * fängt der Cron-Heartbeat (/api/enrichment/run) den Lauf später wieder auf.
 */

export function enrichmentBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const dep = process.env.VERCEL_URL;
  if (dep) return `https://${dep}`;
  return "http://localhost:3000";
}

export async function triggerEnrichmentRun(opts: {
  continuation: boolean;
}): Promise<void> {
  const url = `${enrichmentBaseUrl()}/api/enrichment/run${
    opts.continuation ? "?continue=1" : ""
  }`;
  const secret = process.env.CRON_SECRET;
  try {
    await fetch(url, {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      cache: "no-store",
    });
  } catch {
    // fire-and-forget — Cron-Heartbeat übernimmt bei Ausfall.
  }
}
