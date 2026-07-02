import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  pipelines,
  pipelineStages,
  deals,
  contacts,
  companies,
} from "@/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { PipelineDetail } from "../_components/pipeline-detail";

export const dynamic = "force-dynamic";

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireActiveOrg();

  const [pipeline] = await db
    .select({ id: pipelines.id, name: pipelines.name })
    .from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.orgId, org.id)))
    .limit(1);
  if (!pipeline) notFound();

  const [{ pipelineCount }] = await db
    .select({ pipelineCount: sql<number>`count(*)::int` })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id));

  const stageRows = await db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      position: pipelineStages.position,
      probability: pipelineStages.probability,
      color: pipelineStages.color,
    })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, id))
    .orderBy(asc(pipelineStages.position));

  const dealRows = await db
    .select({
      id: deals.id,
      title: deals.title,
      valueEur: deals.valueEur,
      stageId: deals.stageId,
      contactId: deals.contactId,
      createdAt: deals.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      email: contacts.email,
      lastContactAt: contacts.lastContactAt,
      companyName: companies.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(deals.orgId, org.id), eq(deals.pipelineId, id)))
    .orderBy(desc(deals.createdAt))
    .limit(2000);

  const contactRows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.orgId, org.id))
    .orderBy(desc(contacts.createdAt))
    .limit(2000);

  const dealsMapped = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    valueEur: d.valueEur,
    stageId: d.stageId,
    contactId: d.contactId,
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    email: d.email,
    createdAt: d.createdAt ? d.createdAt.toISOString() : null,
    lastContactAt: d.lastContactAt ? d.lastContactAt.toISOString() : null,
    companyName: d.companyName,
  }));

  const contactOpts = contactRows.map((c) => ({
    id: c.id,
    name:
      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
      c.email ||
      "(ohne Namen)",
    companyName: c.companyName,
  }));

  return (
    <PipelineDetail
      pipelineId={pipeline.id}
      pipelineName={pipeline.name}
      stages={stageRows}
      deals={dealsMapped}
      contacts={contactOpts}
      pipelineCount={pipelineCount}
    />
  );
}
