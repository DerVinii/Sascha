import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { STATUS_LABELS } from "@/components/crm/status-pill";

const VALID_STATUSES = Object.keys(STATUS_LABELS);

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  const org = await requireActiveOrg();
  const status = request.nextUrl.searchParams.get("status");
  const filterByStatus = status && VALID_STATUSES.includes(status);

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
      filterByStatus
        ? and(
            eq(contacts.orgId, org.id),
            eq(contacts.status, status as (typeof VALID_STATUSES)[number] as never),
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
  const prefix = filterByStatus ? `leads-${status}` : "kontakte";
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
