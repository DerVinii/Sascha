import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/db";
import { contacts, companies, leadLists } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { STATUS_LABELS } from "@/components/crm/status-pill";

// DB-Query zur Laufzeit, nicht beim Build.
export const dynamic = "force-dynamic";

const VALID_STATUSES = Object.keys(STATUS_LABELS);

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toISOString();
}

/** Ordnername → dateinamentauglich ("Schulen Dresden" → "schulen-dresden"). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "ordner"
  );
}

export async function GET(request: NextRequest) {
  const org = await requireActiveOrg();
  const status = request.nextUrl.searchParams.get("status");
  const listId = request.nextUrl.searchParams.get("listId");
  const filterByStatus = status && VALID_STATUSES.includes(status);

  // Export aus einem Vertriebs-Ordner: genau dessen Leads, nichts anderes. Der
  // Status wird dabei bewusst ignoriert — die Tabelle im Ordner zeigt ihn auch
  // nicht gefiltert an, sonst fehlten qualifizierte Leads in der Datei.
  let list: { id: string; name: string } | null = null;
  if (listId) {
    // Ohne Formatprüfung wirft Postgres bei einer kaputten ID einen 500er.
    if (!/^[0-9a-f-]{36}$/i.test(listId)) {
      return new NextResponse("Ordner nicht gefunden", { status: 404 });
    }
    const [row] = await db
      .select({ id: leadLists.id, name: leadLists.name })
      .from(leadLists)
      .where(and(eq(leadLists.id, listId), eq(leadLists.orgId, org.id)))
      .limit(1);
    if (!row) {
      return new NextResponse("Ordner nicht gefunden", { status: 404 });
    }
    list = row;
  }

  const rows = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      companyName: companies.name,
      status: contacts.status,
      source: contacts.source,
      tags: contacts.tags,
      lastContactAt: contacts.lastContactAt,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      list
        ? and(eq(contacts.orgId, org.id), eq(contacts.leadListId, list.id))
        : filterByStatus
          ? and(
              eq(contacts.orgId, org.id),
              eq(
                contacts.status,
                status as (typeof VALID_STATUSES)[number] as never,
              ),
            )
          : eq(contacts.orgId, org.id),
    )
    .orderBy(desc(contacts.createdAt));

  const csvRows = rows.map((r) => ({
    Vorname: r.firstName ?? "",
    Nachname: r.lastName ?? "",
    "E-Mail": r.email ?? "",
    Telefon: r.phone ?? "",
    Firma: r.companyName ?? "",
    Status: STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status,
    Quelle: r.source ?? "",
    Tags: r.tags.join(", "),
    "Letzter Kontakt": formatDate(r.lastContactAt),
    "Angelegt am": formatDate(r.createdAt),
  }));

  const csv = Papa.unparse(csvRows, {
    delimiter: ",",
    quotes: true,
    header: true,
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const prefix = list
    ? `leads-${slugify(list.name)}`
    : filterByStatus
      ? `leads-${status}`
      : "kontakte";
  const filename = `${prefix}-${timestamp}.csv`;

  return new NextResponse("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
