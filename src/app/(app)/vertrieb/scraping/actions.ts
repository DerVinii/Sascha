"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { searchPlaces, extractDomain } from "@/lib/server/scraping/places";
import { enrichLead } from "@/lib/server/scraping/enrich";

const SOURCE = "Google Maps";

// ============================================================================
// SCRAPING (oberer n8n-Workflow)
// ============================================================================

export type ScrapeResult = {
  found: number; // von Google gelieferte Treffer
  imported: number; // neu angelegte Leads
  duplicates: number; // bereits vorhanden (per Google-Place-ID übersprungen)
  query: string;
};

/**
 * Sucht Unternehmen zu "{niche} {city}" über die Google-Places-API (bis 60
 * Treffer) und legt pro neuem Unternehmen eine Firma + einen Lead-Kontakt an.
 * Dubletten werden über die Google-Place-ID erkannt.
 */
export async function scrapeLeadsAction(input: {
  niche: string;
  city: string;
}): Promise<ScrapeResult> {
  const org = await requireActiveOrg();
  const niche = input.niche?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const query = `${niche} ${city}`.trim();

  if (!niche || !city) {
    throw new Error("Bitte Nische und Stadt angeben.");
  }

  const places = await searchPlaces(niche, city);
  if (places.length === 0) {
    return { found: 0, imported: 0, duplicates: 0, query };
  }

  // Bereits vorhandene Place-IDs dieser Org laden (Dublettencheck).
  const existingRows = await db
    .select({
      pid: sql<string>`(${companies.customFields} ->> 'googlePlaceId')`,
    })
    .from(companies)
    .where(eq(companies.orgId, org.id));
  const existing = new Set(
    existingRows.map((r) => r.pid).filter(Boolean) as string[],
  );

  const fresh = places.filter((p) => !existing.has(p.placeId));
  if (fresh.length === 0) {
    return {
      found: places.length,
      imported: 0,
      duplicates: places.length,
      query,
    };
  }

  // Firmen anlegen, Place-ID -> company.id zurückbekommen.
  const insertedCompanies = await db
    .insert(companies)
    .values(
      fresh.map((p) => ({
        orgId: org.id,
        name: p.name,
        domain: extractDomain(p.websiteUri),
        address: p.formattedAddress ? { formatted: p.formattedAddress } : null,
        customFields: {
          googlePlaceId: p.placeId,
          googleMapsUri: p.googleMapsUri,
          rating: p.rating,
          websiteUri: p.websiteUri,
          niche,
          city,
        },
      })),
    )
    .returning({
      id: companies.id,
      pid: sql<string>`(${companies.customFields} ->> 'googlePlaceId')`,
    });

  const companyByPlace = new Map(insertedCompanies.map((c) => [c.pid, c.id]));

  // Pro neuer Firma einen Lead-Kontakt (Name/E-Mail kommen beim Enrichment).
  await db.insert(contacts).values(
    fresh.map((p) => ({
      orgId: org.id,
      companyId: companyByPlace.get(p.placeId) ?? null,
      phone: p.phone,
      status: "lead" as const,
      source: SOURCE,
      customFields: { enrichment: "pending" },
    })),
  );

  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");

  return {
    found: places.length,
    imported: fresh.length,
    duplicates: places.length - fresh.length,
    query,
  };
}

// ============================================================================
// ENRICHMENT (unterer n8n-Workflow)
// ============================================================================

/** WHERE: gescrapte Leads ohne Kontaktdaten, die noch nicht versucht wurden. */
function pendingWhere(orgId: string) {
  return and(
    eq(contacts.orgId, orgId),
    eq(contacts.source, SOURCE),
    isNull(contacts.firstName),
    isNull(contacts.lastName),
    isNull(contacts.email),
    sql`(${contacts.customFields} ->> 'enrichment') IS DISTINCT FROM 'done'`,
    sql`(${contacts.customFields} ->> 'enrichment') IS DISTINCT FROM 'not_found'`,
  );
}

async function countPending(orgId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contacts)
    .where(pendingWhere(orgId));
  return row?.c ?? 0;
}

export type EnrichBatchResult = {
  processed: number;
  enriched: number;
  notFound: number;
  failed: number;
  remaining: number;
};

/**
 * Reichert eine kleine Charge offener Leads an (Geschäftsführer + E-Mail via
 * Gemini). Wird vom UI wiederholt aufgerufen, bis `remaining === 0` — so bleibt
 * jeder Serverless-Aufruf kurz (Free-Tier-tauglich).
 */
export async function enrichBatchAction(input?: {
  limit?: number;
}): Promise<EnrichBatchResult> {
  const org = await requireActiveOrg();
  const limit = Math.min(Math.max(input?.limit ?? 4, 1), 8);

  const batch = await db
    .select({
      id: contacts.id,
      companyName: companies.name,
      websiteUri: sql<
        string | null
      >`(${companies.customFields} ->> 'websiteUri')`,
      gmapsUri: sql<
        string | null
      >`(${companies.customFields} ->> 'googleMapsUri')`,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(pendingWhere(org.id))
    .limit(limit);

  let enriched = 0;
  let notFound = 0;
  let failed = 0;

  await Promise.all(
    batch.map(async (lead) => {
      try {
        const r = await enrichLead({
          firmenname: lead.companyName ?? "",
          webseite: lead.websiteUri,
          gmapsUrl: lead.gmapsUri,
        });

        if (r.found) {
          const email =
            r.email.toUpperCase() === "NF" || !r.email.includes("@")
              ? null
              : r.email.toLowerCase();
          await db
            .update(contacts)
            .set({
              firstName: r.vorname.toUpperCase() === "NF" ? null : r.vorname,
              lastName: r.nachname.toUpperCase() === "NF" ? null : r.nachname,
              email,
              customFields: sql`${contacts.customFields} || ${JSON.stringify({ enrichment: "done", enrichedAt: new Date().toISOString() })}::jsonb`,
            })
            .where(and(eq(contacts.id, lead.id), eq(contacts.orgId, org.id)));
          enriched++;
        } else {
          await db
            .update(contacts)
            .set({
              customFields: sql`${contacts.customFields} || ${JSON.stringify({ enrichment: "not_found", enrichedAt: new Date().toISOString() })}::jsonb`,
            })
            .where(and(eq(contacts.id, lead.id), eq(contacts.orgId, org.id)));
          notFound++;
        }
      } catch {
        failed++;
      }
    }),
  );

  const remaining = await countPending(org.id);

  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");

  return { processed: batch.length, enriched, notFound, failed, remaining };
}

// ============================================================================
// STATS (für die Scraping-Seite)
// ============================================================================

export type ScrapingStats = {
  scraped: number;
  pending: number;
  enriched: number;
};

export async function getScrapingStatsAction(): Promise<ScrapingStats> {
  const org = await requireActiveOrg();

  const [scrapedRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.source, SOURCE)));

  const [enrichedRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, org.id),
        eq(contacts.source, SOURCE),
        sql`(${contacts.customFields} ->> 'enrichment') = 'done'`,
      ),
    );

  const pending = await countPending(org.id);

  return {
    scraped: scrapedRow?.c ?? 0,
    enriched: enrichedRow?.c ?? 0,
    pending,
  };
}
