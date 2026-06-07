/**
 * Google Places API (New) — Text Search mit Pagination.
 *
 * Bildet den oberen n8n-Workflow ab: `POST places:searchText` mit
 * `textQuery = "{Nische} {Stadt}"`, holt bis zu 3 Seiten (Google-Limit,
 * max. 60 Treffer pro Suche) über den `nextPageToken`.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "nextPageToken",
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.rating",
].join(",");

export type ScrapedPlace = {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phone: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
};

type SearchPageResult = {
  places: ScrapedPlace[];
  nextPageToken: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrahiert die Domain (ohne www.) aus einer URL — für companies.domain. */
export function extractDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePlace(p: any): ScrapedPlace | null {
  if (!p?.id) return null;
  return {
    placeId: String(p.id),
    name: p.displayName?.text ?? p.displayName ?? "(ohne Namen)",
    formattedAddress: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    websiteUri: p.websiteUri ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
  };
}

async function searchPage(
  apiKey: string,
  textQuery: string,
  pageToken?: string,
): Promise<SearchPageResult> {
  const body: Record<string, unknown> = {
    textQuery,
    languageCode: "de",
    regionCode: "DE",
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Google Places API ${res.status}: ${detail.slice(0, 300) || res.statusText}`,
    );
  }

  const data = await res.json();
  const places = Array.isArray(data.places)
    ? (data.places.map(normalizePlace).filter(Boolean) as ScrapedPlace[])
    : [];
  return { places, nextPageToken: data.nextPageToken ?? null };
}

/**
 * Sucht Unternehmen zu "{niche} {city}". Paginiert bis maxPages (default 3 =
 * Google-Limit von 60 Treffern). Dedupliziert innerhalb der Suche über placeId.
 */
export async function searchPlaces(
  niche: string,
  city: string,
  opts?: { maxPages?: number },
): Promise<ScrapedPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    const raw = process.env.GOOGLE_PLACES_API_KEY;
    throw new Error(
      `GOOGLE_PLACES_API_KEY fehlt zur Laufzeit (defined=${raw !== undefined}, len=${(raw ?? "").length}) — in der Vercel-Env prüfen.`,
    );
  }

  const textQuery = `${niche} ${city}`.trim();
  if (!textQuery) return [];

  const maxPages = Math.min(Math.max(opts?.maxPages ?? 3, 1), 3);
  const seen = new Set<string>();
  const all: ScrapedPlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const { places, nextPageToken } = await searchPage(
      apiKey,
      textQuery,
      pageToken,
    );
    for (const place of places) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      all.push(place);
    }
    if (!nextPageToken) break;
    pageToken = nextPageToken;
    // Der pageToken braucht kurz, bis er serverseitig gültig ist.
    if (page < maxPages - 1) await sleep(2000);
  }

  return all;
}
