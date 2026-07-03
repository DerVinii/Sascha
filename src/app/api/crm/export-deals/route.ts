import { NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/db";
import { deals, contacts, pipelines, pipelineStages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";

// DB-Query zur Laufzeit, nicht beim Build.
export const dynamic = "force-dynamic";

function formatDate(d: Date | null) {
  if (!d) return "";
  return d.toISOString();
}

export async function GET() {
  const org = await requireActiveOrg();

  const rows = await db
    .select({
      title: deals.title,
      valueEur: deals.valueEur,
      pipelineName: pipelines.name,
      stageName: pipelineStages.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      expectedClose: deals.expectedClose,
      createdAt: deals.createdAt,
    })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .where(eq(deals.orgId, org.id))
    .orderBy(desc(deals.createdAt));

  const csvRows = rows.map((r) => ({
    Deal: r.title,
    "Wert (EUR)": r.valueEur ?? "",
    Pipeline: r.pipelineName,
    Phase: r.stageName,
    Vorname: r.firstName ?? "",
    Nachname: r.lastName ?? "",
    "E-Mail": r.email ?? "",
    "Erwarteter Abschluss": formatDate(r.expectedClose),
    "Angelegt am": formatDate(r.createdAt),
  }));

  const csv = Papa.unparse(csvRows, {
    delimiter: ",",
    quotes: true,
    header: true,
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `deals-${timestamp}.csv`;

  return new NextResponse("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
