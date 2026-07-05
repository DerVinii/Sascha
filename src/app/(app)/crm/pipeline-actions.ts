"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { pipelines, pipelineStages, deals, contacts } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { DEFAULT_STAGES } from "@/lib/pipeline-templates";
import {
  onDealCreated,
  onDealDeleted,
  linkedListForPipeline,
} from "@/lib/server/pipeline-sync";

/** Auch die Vertriebs-Ordner-Ansicht auffrischen (verbundene Pipeline). */
function revalidateLinkedFolder() {
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
}

// ── Org-Scoping-Helfer ──────────────────────────────────────────────────────

async function pipelineInOrg(pipelineId: string, orgId: string): Promise<boolean> {
  const [p] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.orgId, orgId)))
    .limit(1);
  return Boolean(p);
}

async function stagePipeline(
  stageId: string,
  orgId: string,
): Promise<string | null> {
  const [s] = await db
    .select({ pipelineId: pipelineStages.pipelineId })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .where(and(eq(pipelineStages.id, stageId), eq(pipelines.orgId, orgId)))
    .limit(1);
  return s?.pipelineId ?? null;
}

// ── Pipelines ────────────────────────────────────────────────────────────────

export async function createPipeline(name: string): Promise<string> {
  const org = await requireActiveOrg();

  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${pipelines.position}), -1)::int` })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id));

  const [pl] = await db
    .insert(pipelines)
    .values({
      orgId: org.id,
      name: name.trim() || "Neue Pipeline",
      position: maxPos + 1,
    })
    .returning({ id: pipelines.id });

  await db.insert(pipelineStages).values(
    DEFAULT_STAGES.map((s, i) => ({
      pipelineId: pl.id,
      name: s.name,
      position: i,
      color: s.color,
    })),
  );

  revalidatePath("/crm");
  revalidatePath("/pipelines");
  return pl.id;
}

export async function reorderPipeline(pipelineId: string, dir: "up" | "down") {
  const org = await requireActiveOrg();
  const rows = await db
    .select({ id: pipelines.id, position: pipelines.position })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id))
    .orderBy(asc(pipelines.position), asc(pipelines.createdAt));

  const idx = rows.findIndex((p) => p.id === pipelineId);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;

  const cur = rows[idx];
  const other = rows[swapIdx];
  await db
    .update(pipelines)
    .set({ position: other.position })
    .where(and(eq(pipelines.id, cur.id), eq(pipelines.orgId, org.id)));
  await db
    .update(pipelines)
    .set({ position: cur.position })
    .where(and(eq(pipelines.id, other.id), eq(pipelines.orgId, org.id)));
  revalidatePath("/pipelines");
}

export async function renamePipeline(pipelineId: string, name: string) {
  const org = await requireActiveOrg();
  await db
    .update(pipelines)
    .set({ name: name.trim() || "Pipeline" })
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

export async function deletePipeline(pipelineId: string) {
  const org = await requireActiveOrg();
  // Letzte Pipeline nicht löschen (sonst ist die Pipeline-Ansicht leer/kaputt).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id));
  if (n <= 1) throw new Error("Die letzte Pipeline kann nicht gelöscht werden.");

  // In fester Reihenfolge löschen (Deals → Phasen → Pipeline): deals.stage_id
  // hat eine RESTRICT-FK auf pipeline_stages, deshalb dürfen wir uns NICHT auf
  // die (nicht garantierte) Cascade-Reihenfolge von Postgres verlassen.
  await db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, pipelineId), eq(pipelines.orgId, org.id)))
      .limit(1);
    if (!p) return;
    await tx.delete(deals).where(eq(deals.pipelineId, pipelineId));
    await tx
      .delete(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipelineId));
    await tx.delete(pipelines).where(eq(pipelines.id, pipelineId));
  });
  // Ein verbundener Ordner wird durch die FK (ON DELETE SET NULL) automatisch
  // entkoppelt; die "Pipeline-Phase"-Spalte verschwindet beim nächsten Laden.
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidateLinkedFolder();
}

// ── Stages ─────────────────────────────────────────────────────────────────

export async function addStage(pipelineId: string, name: string) {
  const org = await requireActiveOrg();
  if (!(await pipelineInOrg(pipelineId, org.id)))
    throw new Error("Pipeline nicht gefunden.");

  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${pipelineStages.position}), -1)::int` })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId));

  await db.insert(pipelineStages).values({
    pipelineId,
    name: name.trim() || "Neue Phase",
    position: maxPos + 1,
    color: "#e0e7ff",
  });
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

export async function updateStage(
  stageId: string,
  patch: { name?: string; color?: string },
) {
  const org = await requireActiveOrg();
  if (!(await stagePipeline(stageId, org.id)))
    throw new Error("Phase nicht gefunden.");

  const set: { name?: string; color?: string } = {};
  if (patch.name !== undefined) set.name = patch.name.trim() || "Phase";
  if (patch.color !== undefined) set.color = patch.color;
  if (Object.keys(set).length === 0) return;

  await db.update(pipelineStages).set(set).where(eq(pipelineStages.id, stageId));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

export async function deleteStage(stageId: string) {
  const org = await requireActiveOrg();
  const pipelineId = await stagePipeline(stageId, org.id);
  if (!pipelineId) throw new Error("Phase nicht gefunden.");

  const [{ dealCount }] = await db
    .select({ dealCount: sql<number>`count(*)::int` })
    .from(deals)
    .where(eq(deals.stageId, stageId));
  if (dealCount > 0)
    throw new Error(
      `Diese Phase enthält ${dealCount} Deal(s). Bitte zuerst verschieben.`,
    );

  const [{ stageCount }] = await db
    .select({ stageCount: sql<number>`count(*)::int` })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId));
  if (stageCount <= 1)
    throw new Error("Eine Pipeline braucht mindestens eine Phase.");

  await db.delete(pipelineStages).where(eq(pipelineStages.id, stageId));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

export async function moveStage(stageId: string, dir: "up" | "down") {
  const org = await requireActiveOrg();
  const pipelineId = await stagePipeline(stageId, org.id);
  if (!pipelineId) throw new Error("Phase nicht gefunden.");

  const rows = await db
    .select({ id: pipelineStages.id, position: pipelineStages.position })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId))
    .orderBy(asc(pipelineStages.position));

  const idx = rows.findIndex((s) => s.id === stageId);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;

  const cur = rows[idx];
  const other = rows[swapIdx];
  await db
    .update(pipelineStages)
    .set({ position: other.position })
    .where(eq(pipelineStages.id, cur.id));
  await db
    .update(pipelineStages)
    .set({ position: cur.position })
    .where(eq(pipelineStages.id, other.id));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

// ── Deals ─────────────────────────────────────────────────────────────────

export type CreateDealInput = {
  contactId?: string | null;
  pipelineId: string;
  stageId: string;
  title: string;
  valueEur?: number | null;
  expectedClose?: string | null;
};

export async function createDeal(input: CreateDealInput) {
  const org = await requireActiveOrg();
  if (!(await pipelineInOrg(input.pipelineId, org.id)))
    throw new Error("Pipeline nicht gefunden.");
  const stagePipe = await stagePipeline(input.stageId, org.id);
  if (stagePipe !== input.pipelineId)
    throw new Error("Phase gehört nicht zur gewählten Pipeline.");

  let contactId = input.contactId || null;
  if (contactId) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)))
      .limit(1);
    if (!c) contactId = null;
  }

  // In einer mit einem Ordner VERBUNDENEN Pipeline gilt max. 1 Deal je Kontakt
  // (die Ordner-Synchronisation setzt das voraus). Existiert schon einer, keinen
  // zweiten anlegen — sonst Duplikate und Geister-Deals beim Spiegeln. In nicht
  // verbundenen Pipelines bleibt das freie Mehrfach-Anlegen unangetastet.
  if (contactId && (await linkedListForPipeline(org.id, input.pipelineId))) {
    const [existing] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, org.id),
          eq(deals.contactId, contactId),
          eq(deals.pipelineId, input.pipelineId),
        ),
      )
      .limit(1);
    if (existing) {
      await onDealCreated(org.id, contactId, input.pipelineId);
      revalidatePath("/crm");
      revalidatePath("/pipelines");
      revalidateLinkedFolder();
      return;
    }
  }

  await db.insert(deals).values({
    orgId: org.id,
    contactId,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    title: input.title.trim() || "Neuer Deal",
    valueEur: input.valueEur ?? null,
    expectedClose: input.expectedClose ? new Date(input.expectedClose) : null,
  });
  // Pipeline → Ordner: ist die Pipeline mit einem Ordner verbunden, wandert der
  // Lead in den Ordner (sofern er noch keinem zugeordnet ist).
  await onDealCreated(org.id, contactId, input.pipelineId);
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidateLinkedFolder();
}

export async function moveDealToStage(dealId: string, stageId: string) {
  const org = await requireActiveOrg();
  const pipelineId = await stagePipeline(stageId, org.id);
  if (!pipelineId) throw new Error("Phase nicht gefunden.");

  await db
    .update(deals)
    .set({ stageId, pipelineId })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidateLinkedFolder();
}

export async function updateDeal(
  dealId: string,
  patch: {
    title?: string;
    valueEur?: number | null;
    expectedClose?: string | null;
    stageId?: string;
    contactId?: string | null;
  },
) {
  const org = await requireActiveOrg();
  const set: {
    title?: string;
    valueEur?: number | null;
    expectedClose?: Date | null;
    contactId?: string | null;
    stageId?: string;
    pipelineId?: string;
  } = {};
  if (patch.title !== undefined) set.title = patch.title.trim() || "Deal";
  if (patch.valueEur !== undefined) set.valueEur = patch.valueEur;
  if (patch.expectedClose !== undefined)
    set.expectedClose = patch.expectedClose ? new Date(patch.expectedClose) : null;
  if (patch.contactId !== undefined) set.contactId = patch.contactId || null;
  if (patch.stageId !== undefined) {
    const pipelineId = await stagePipeline(patch.stageId, org.id);
    if (!pipelineId) throw new Error("Phase nicht gefunden.");
    set.stageId = patch.stageId;
    set.pipelineId = pipelineId;
  }
  if (Object.keys(set).length === 0) return;

  await db
    .update(deals)
    .set(set)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidateLinkedFolder();
}

export async function deleteDeal(dealId: string) {
  const org = await requireActiveOrg();
  // Kontakt + Pipeline des Deals VOR dem Löschen merken (für die Ordner-Spiegelung).
  const [d] = await db
    .select({ contactId: deals.contactId, pipelineId: deals.pipelineId })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)))
    .limit(1);

  await db
    .delete(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  // Pipeline → Ordner: ist die Pipeline mit einem Ordner verbunden und der Lead
  // liegt dort, wird er komplett gelöscht (voll gespiegelt).
  if (d?.pipelineId) await onDealDeleted(org.id, d.contactId, d.pipelineId);

  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidateLinkedFolder();
}
