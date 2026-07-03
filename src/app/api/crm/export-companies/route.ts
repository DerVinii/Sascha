import { NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";

// DB-Query zur Laufzeit, nicht beim Build.
export const dynamic = "force-dynamic";

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toISOString();
}

/** companies.address ist unstrukturiertes JSONB — lesbar zusammensetzen. */
function formatAddress(address: unknown): string {
  if (!address) return "";
  if (typeof address === "string") return address;
  if (typeof address === "object" && !Array.isArray(address)) {
    return Object.values(address as Record<string, unknown>)
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .map(String)
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export async function GET() {
  const org = await requireActiveOrg();

  const rows = await db
    .select({
      name: companies.name,
      domain: companies.domain,
      address: companies.address,
      contactCount: sql<number>`count(${contacts.id})::int`,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .leftJoin(contacts, eq(contacts.companyId, companies.id))
    .where(eq(companies.orgId, org.id))
    .groupBy(companies.id)
    .orderBy(desc(companies.createdAt));

  const csvRows = rows.map((r) => ({
    Firma: r.name,
    Webseite: r.domain ?? "",
    Adresse: formatAddress(r.address),
    Kontakte: r.contactCount,
    "Angelegt am": formatDate(r.createdAt),
  }));

  const csv = Papa.unparse(csvRows, {
    delimiter: ",",
    quotes: true,
    header: true,
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `firmen-${timestamp}.csv`;

  return new NextResponse("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
