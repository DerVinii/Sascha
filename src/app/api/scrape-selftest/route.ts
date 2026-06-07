import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/server/scraping/places";
import { enrichLead } from "@/lib/server/scraping/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Self-Test des Scrape-Pfads: führt das ECHTE `searchPlaces` serverseitig aus
 * (gleicher Code wie die Server-Action) und gibt ein strukturiertes Ergebnis
 * zurück — so testbar per `curl`, ohne Browser/Skew-Effekte. Temporär.
 * Aufruf: /api/scrape-selftest?t=diag&niche=Dachdecker&city=Magdeburg
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "diag") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const niche = url.searchParams.get("niche") ?? "Dachdecker";
  const city = url.searchParams.get("city") ?? "Magdeburg";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    env: {
      GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      DATABASE_URL: !!process.env.DATABASE_URL,
    },
    query: `${niche} ${city}`,
  };

  const mode = url.searchParams.get("mode") ?? "scrape";

  try {
    const places = await searchPlaces(niche, city);
    out.count = places.length;
    out.sample = places.slice(0, 3).map((p) => p.name);

    if (mode === "enrich" && places[0]) {
      // testet den Gemini-Pfad end-to-end (nur Booleans zurück, keine PII).
      const r = await enrichLead({
        firmenname: places[0].name,
        webseite: places[0].websiteUri,
        gmapsUrl: places[0].googleMapsUri,
      });
      out.enrich = {
        found: r.found,
        hasEmail: r.email !== "NF" && r.email.includes("@"),
      };
    }
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  return NextResponse.json(out);
}
