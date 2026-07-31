/**
 * Hintergrund-Enrichment-Drain.
 *
 * Angestoßen von "Update cells" (queueEnrichmentAction) und vom Vercel-Cron-
 * Heartbeat. Antwortet sofort mit 202 und erledigt die eigentliche Arbeit in
 * `after()` — so läuft die Anreicherung server-seitig weiter, unabhängig davon,
 * ob der Client noch offen ist. Bei noch offener Arbeit stößt sie den nächsten
 * Hop selbst an (Self-Chaining); der Cron fängt abgebrochene Ketten wieder auf.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { drainQueuedLists } from "@/lib/server/scraping/enrich-run";
import { triggerEnrichmentRun } from "@/lib/server/scraping/enrichment-trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // noch kein Secret gesetzt -> offen (nur Übergang)
  // Vercel-Cron sendet automatisch "Authorization: Bearer $CRON_SECRET".
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const isContinuation =
    new URL(req.url).searchParams.get("continue") === "1";

  after(async () => {
    try {
      const summary = await drainQueuedLists({
        budgetMs: 45_000,
        isContinuation,
      });
      // Bei einem Umgebungsfehler (Prüfserver/Secret) NICHT weiterketten — jeder
      // Hop bräche sofort wieder ab und die Kette liefe endlos im Sekundentakt.
      if (
        summary.anyRemaining &&
        !summary.rateLimited &&
        !summary.configError
      ) {
        await triggerEnrichmentRun({ continuation: true });
      }
    } catch {
      // Bei Fehlern greift der Cron-Heartbeat später erneut.
    }
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
