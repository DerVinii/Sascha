import { db } from "@/db";
import { pipelines, pipelineStages, deals } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { PipelinesGrid } from "./_components/pipelines-grid";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const org = await requireActiveOrg();

  const pls = await db
    .select({
      id: pipelines.id,
      name: pipelines.name,
      position: pipelines.position,
    })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id))
    .orderBy(asc(pipelines.position), asc(pipelines.createdAt));

  const pcounts = await db
    .select({
      pipelineId: deals.pipelineId,
      n: sql<number>`count(*)::int`,
    })
    .from(deals)
    .where(eq(deals.orgId, org.id))
    .groupBy(deals.pipelineId);
  const dealCount = new Map(pcounts.map((r) => [r.pipelineId, r.n]));

  const stageRows = await db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      position: pipelineStages.position,
      probability: pipelineStages.probability,
      color: pipelineStages.color,
      pipelineId: pipelineStages.pipelineId,
      dealCount: sql<number>`count(${deals.id})::int`,
    })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .leftJoin(deals, eq(deals.stageId, pipelineStages.id))
    .where(eq(pipelines.orgId, org.id))
    .groupBy(pipelineStages.id)
    .orderBy(asc(pipelineStages.position));

  const data = pls.map((p) => ({
    id: p.id,
    name: p.name,
    dealCount: dealCount.get(p.id) ?? 0,
    stages: stageRows
      .filter((s) => s.pipelineId === p.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        color: s.color,
        dealCount: s.dealCount,
      })),
  }));

  return <PipelinesGrid pipelines={data} />;
}
