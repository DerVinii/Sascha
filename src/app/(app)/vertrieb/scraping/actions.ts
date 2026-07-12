"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  contacts,
  companies,
  organizations,
  leadColumns,
  leadLists,
  pipelines,
  pipelineStages,
  deals,
} from "@/db/schema";
import { eq, and, sql, asc, desc, inArray, isNotNull } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { searchPlaces, extractDomain } from "@/lib/server/scraping/places";
import { triggerEnrichmentRun } from "@/lib/server/scraping/enrichment-trigger";
import { createPipeline } from "@/app/(app)/crm/pipeline-actions";
import {
  linkedPipelineForList,
  backfillListToPipeline,
  onContactsAddedToList,
  deleteDealsForContacts,
  setContactDealStage,
  pipelineStagesFor,
  dealStageByContact,
} from "@/lib/server/pipeline-sync";
import { autoAdvanceListLeads } from "@/lib/server/pipeline-auto";
import {
  bulkAddLeads,
  findLeadIdByEmail,
  findLeadCampaignsByEmail,
  updateLead,
  deleteLeadsByEmails,
  listAccounts,
  getCampaign,
  createCampaign,
  updateCampaign,
  activateCampaign,
  pauseCampaign,
  deleteCampaign,
  listCampaigns,
  type InstantlyLead,
  type InstantlySequence,
} from "@/lib/server/instantly/client";
import {
  ensureDefaultColumns,
  getColumns,
  getColumnByKey,
  buildCells,
  cellNeedsRun,
  passesOnlyRunIf,
  BUILTIN_VIEWS,
  ENRICHMENT_KEY,
  type RowSources,
} from "@/lib/server/scraping/lead-columns";
import {
  loadLeadRows,
  cellPatch,
  runEnrichmentForRow,
  pendingCountForList,
  ENRICH_STALE_MS,
} from "@/lib/server/scraping/enrich-run";
import {
  emailFinderCellNeedsRun,
  emailFinderReady,
  runEmailFinderPool,
} from "@/lib/server/scraping/reacher";
import {
  instantlyVarToken,
  isUserColumn,
  EMAIL_FINDER_KEY,
  PIPELINE_STAGE_KEY,
} from "@/lib/scraping-types";
import type {
  LeadColumn,
  LeadColumnConfig,
  LeadColumnKind,
  LeadDataType,
  LeadList,
  LeadTableData,
  LeadView,
  RunBatchResult,
  RunScope,
  InstantlySendFilter,
  InstantlySendPreview,
  InstantlySendResult,
  CampaignStep,
  CampaignSenderAccount,
  CampaignSetupInfo,
  SaveCampaignResult,
} from "@/lib/scraping-types";

const SOURCE = "Google Maps";

// ============================================================================
// Hilfen
// ============================================================================

function slugKey(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const s = base || "col";
  return /^[0-9]/.test(s) ? `c_${s}` : s;
}

function uniqueKey(base: string, used: Set<string>): string {
  let k = base;
  let i = 2;
  while (used.has(k)) k = `${base}_${i++}`;
  return k;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(n, lo), hi);
}

async function getOrgViews(orgId: string): Promise<LeadView[]> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const custom = ((row?.settings as any)?.leadViews ?? []) as LeadView[];
  return custom;
}

// ============================================================================
// SOURCE: Google-Maps-Suche (oberer n8n-Workflow)
// ============================================================================

export type ScrapeResult = {
  found: number;
  imported: number;
  duplicates: number;
  query: string;
  error?: string | null;
};

export async function runSourceAction(input: {
  niche: string;
  city: string;
  listId: string;
}): Promise<ScrapeResult> {
  const niche = input.niche?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const listId = input.listId;
  const query = `${niche} ${city}`.trim();

  if (!niche || !city) {
    return {
      found: 0,
      imported: 0,
      duplicates: 0,
      query,
      error: "Bitte Nische und Stadt angeben.",
    };
  }
  if (!listId) {
    return {
      found: 0,
      imported: 0,
      duplicates: 0,
      query,
      error: "Keine Kampagne ausgewählt.",
    };
  }

  // Fehler werden zurückgegeben (nicht geworfen) — sonst redacted Next sie in
  // Production zu einer generischen Meldung ohne Details.
  try {
    const org = await requireActiveOrg();

    const places = await searchPlaces(niche, city);
    if (places.length === 0)
      return { found: 0, imported: 0, duplicates: 0, query };

    const existingRows = await db
      .select({
        pid: sql<string>`(${companies.customFields} ->> 'googlePlaceId')`,
      })
      .from(companies)
      .where(
        and(eq(companies.orgId, org.id), eq(companies.leadListId, listId)),
      );
    const existing = new Set(
      existingRows.map((r) => r.pid).filter(Boolean) as string[],
    );

    const fresh = places.filter((p) => !existing.has(p.placeId));
    if (fresh.length === 0)
      return {
        found: places.length,
        imported: 0,
        duplicates: places.length,
        query,
      };

    const insertedCompanies = await db
      .insert(companies)
      .values(
        fresh.map((p) => ({
          orgId: org.id,
          leadListId: listId,
          name: p.name,
          domain: extractDomain(p.websiteUri),
          address: p.formattedAddress
            ? { formatted: p.formattedAddress }
            : null,
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

    const insertedContacts = await db
      .insert(contacts)
      .values(
        fresh.map((p) => ({
          orgId: org.id,
          leadListId: listId,
          companyId: companyByPlace.get(p.placeId) ?? null,
          phone: p.phone,
          status: "lead" as const,
          source: SOURCE,
          customFields: {},
        })),
      )
      .returning({ id: contacts.id });

    // Ordner ↔ Pipeline: neue Leads als Deals spiegeln (falls verbunden).
    await onContactsAddedToList(
      org.id,
      listId,
      insertedContacts.map((c) => c.id),
    );

    revalidatePath("/vertrieb/scraping");
    revalidatePath("/vertrieb");
    revalidatePath("/crm");

    return {
      found: places.length,
      imported: fresh.length,
      duplicates: places.length - fresh.length,
      query,
    };
  } catch (e) {
    return {
      found: 0,
      imported: 0,
      duplicates: 0,
      query,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

// ============================================================================
// TABLE laden
// ============================================================================

export async function listLeadTableAction(input: {
  listId: string;
}): Promise<LeadTableData> {
  const org = await requireActiveOrg();
  const listId = input.listId;
  // Nur global + diesem Ordner zugeordnete Spalten laden (selbst angelegte Spalten
  // erscheinen ausschließlich in ihrem eigenen Ordner).
  const columns = await ensureDefaultColumns(org.id, listId);

  // "Email_Entscheider" steht IMMER direkt rechts von "E-Mail" — Position wird
  // nur fürs Rendering erzwungen (nicht gespeichert), damit auch Umsortieren
  // die Regel nicht bricht.
  const emailCol = columns.find((c) => c.key === "email");
  const finderCol = columns.find((c) => c.key === EMAIL_FINDER_KEY);
  if (emailCol && finderCol) {
    finderCol.position = emailCol.position + 0.5;
    finderCol.pinned = emailCol.pinned;
  }

  const [listRow] = await db
    .select({
      name: leadLists.name,
      pipelineId: leadLists.pipelineId,
      instantlyCampaignId: leadLists.instantlyCampaignId,
    })
    .from(leadLists)
    .where(and(eq(leadLists.id, listId), eq(leadLists.orgId, org.id)))
    .limit(1);
  if (!listRow) throw new Error("Kampagne nicht gefunden.");

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.leadListId, listId)));

  const srcs = await loadLeadRows(org.id, listId);
  const rows = srcs.map((src) => ({
    id: src.contact.id,
    companyId: src.contact.companyId,
    cells: buildCells(columns, src),
  }));

  const views = [...BUILTIN_VIEWS, ...(await getOrgViews(org.id))];

  // "Pipeline-Phase"-Spalte: nur synthetisch anhängen, wenn der Ordner mit einer
  // Pipeline verbunden ist. Nicht in lead_columns gespeichert (die sind org-weit).
  let outColumns: LeadColumn[] = columns;
  let linkedPipeline: { id: string; name: string } | null = null;

  if (listRow.pipelineId) {
    const [pl] = await db
      .select({ id: pipelines.id, name: pipelines.name })
      .from(pipelines)
      .where(
        and(eq(pipelines.id, listRow.pipelineId), eq(pipelines.orgId, org.id)),
      )
      .limit(1);
    if (pl) {
      linkedPipeline = { id: pl.id, name: pl.name };
      const stages = await pipelineStagesFor(pl.id);
      const stageMap = new Map(stages.map((s) => [s.id, s]));
      const byContact = await dealStageByContact(
        org.id,
        pl.id,
        rows.map((r) => r.id),
      );

      // Immer ganz links: gepinnt + negative Position (die Sortierung in
      // visibleColumns setzt pinned zuerst, dann aufsteigend nach position).
      const phaseCol: LeadColumn = {
        id: PIPELINE_STAGE_KEY,
        key: PIPELINE_STAGE_KEY,
        label: "Pipeline-Phase",
        kind: "data",
        dataType: "select",
        position: -1,
        width: 190,
        pinned: true,
        color: null,
        hidden: false,
        config: {
          system: true,
          pipeline: {
            pipelineId: pl.id,
            stages: stages.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
            })),
          },
        },
      };
      outColumns = [...columns, phaseCol];

      for (const row of rows) {
        const sid = byContact.get(row.id) ?? null;
        const st = sid ? stageMap.get(sid) : null;
        row.cells[PIPELINE_STAGE_KEY] = {
          value: st?.name ?? null,
          status: st ? "success" : "empty",
          editable: false,
          color: st?.color ?? null,
          stageId: sid,
        };
      }
    }
  }

  return {
    columns: outColumns,
    rows,
    total: totalRow?.total ?? 0,
    views,
    listId,
    listName: listRow.name,
    linkedPipeline,
    hasCampaign: !!listRow.instantlyCampaignId,
  };
}

// ============================================================================
// ENRICHMENT-RUN (Zelle / Auswahl / Spalte / alle) — unterer n8n-Workflow
// ============================================================================

// Die eigentliche Enrichment-Engine (runEnrichmentForRow, Drain, Rate-Limit-
// Erkennung) liegt in enrich-run.ts, damit sie sowohl von diesen Server-Actions
// als auch von der Hintergrund-Route /api/enrichment/run genutzt werden kann.

export async function runEnrichmentBatchAction(input: {
  columnKey: string;
  scope: RunScope;
  listId: string;
}): Promise<RunBatchResult> {
  const org = await requireActiveOrg();
  const column = await getColumnByKey(org.id, input.columnKey);
  if (!column || (column.kind !== "enrichment" && !column.config.ai)) {
    throw new Error("Spalte ist keine Enrichment-/KI-Spalte.");
  }

  const columns = await getColumns(org.id, input.listId);
  const all = await loadLeadRows(org.id, input.listId);

  // Email_Entscheider (Reacher): eigener Sliding-Window-Pool mit eigener
  // Abrechnung (Teil-Läufe fortsetzen statt neu starten) — siehe unten.
  if (column.key === EMAIL_FINDER_KEY) {
    return runEmailFinderBatch(org.id, column, columns, all, input.scope);
  }

  const limit = clamp(
    ("limit" in input.scope ? input.scope.limit : undefined) ?? 4,
    1,
    8,
  );

  let toProcess: RowSources[] = [];
  let scopeTotal = 0;
  const offset =
    !("rowIds" in input.scope) && input.scope.mode === "force"
      ? Math.max(0, input.scope.offset ?? 0)
      : 0;

  if ("rowIds" in input.scope) {
    const map = new Map(all.map((s) => [s.contact.id, s]));
    const ordered = input.scope.rowIds
      .map((id) => map.get(id))
      .filter(Boolean) as RowSources[];
    toProcess = ordered.slice(0, limit);
    scopeTotal = input.scope.rowIds.length;
  } else if (input.scope.mode === "force") {
    toProcess = all.slice(offset, offset + limit);
    scopeTotal = all.length;
  } else {
    // missing: nur Zellen, die einen Run brauchen + "Only run if".
    // excludeRowIds = in diesem Lauf bereits versuchte Zeilen; nicht erneut ziehen,
    // sonst würden Fehler-Zellen (die weiter „braucht Run" sind) den Lauf in eine
    // Endlosschleife treiben.
    const onlyRunIf = column.config.runSettings?.onlyRunIf;
    const exclude = new Set(input.scope.excludeRowIds ?? []);
    const candidates = all.filter((src) => {
      if (exclude.has(src.contact.id)) return false;
      const cell = buildCells(columns, src)[column.key];
      return cellNeedsRun(cell) && passesOnlyRunIf(onlyRunIf, src.contact);
    });
    toProcess = candidates.slice(0, limit);
    scopeTotal = candidates.length;
  }

  const results = await Promise.all(
    toProcess.map((src) => runEnrichmentForRow(org.id, column, src, columns)),
  );

  let succeeded = 0;
  let notFound = 0;
  let failed = 0;
  let rateLimited = false;
  for (const r of results) {
    if (r.status === "success") succeeded++;
    else if (r.status === "not_found") notFound++;
    else if (r.status === "error") {
      failed++;
      if (r.rateLimited) rateLimited = true;
    }
  }

  const remaining =
    !("rowIds" in input.scope) && input.scope.mode === "force"
      ? Math.max(0, all.length - (offset + toProcess.length))
      : Math.max(0, scopeTotal - toProcess.length);

  revalidatePath("/vertrieb/scraping");
  revalidatePath("/vertrieb");
  revalidatePath("/crm");

  return {
    processed: toProcess.length,
    succeeded,
    notFound,
    failed,
    remaining,
    rowIds: toProcess.map((s) => s.contact.id),
    rateLimited,
  };
}

/**
 * Foreground-Batch für die Spalte Email_Entscheider: verarbeitet die offenen
 * Zeilen mit einem Sliding-Window-Pool (bis zu EMAIL_FINDER_CONCURRENCY Zeilen
 * gleichzeitig, siehe reacher.ts) und einem festen Zeitbudget. Schafft der
 * Aufruf nicht alle Varianten einer Zeile, sichert die Zeile ihren Fortschritt
 * ("partial") und der Client ruft erneut auf — dann geht es genau dort weiter.
 */
async function runEmailFinderBatch(
  orgId: string,
  column: LeadColumn,
  columns: LeadColumn[],
  all: RowSources[],
  scope: RunScope,
): Promise<RunBatchResult> {
  // Seite läuft mit maxDuration=60 → 45 s Arbeitsbudget, Rest für die Antwort.
  const deadline = Date.now() + 45_000;
  const onlyRunIf = column.config.runSettings?.onlyRunIf;

  let workingSet: RowSources[] = [];
  let scopeTotal = 0;
  const offset =
    !("rowIds" in scope) && scope.mode === "force"
      ? Math.max(0, scope.offset ?? 0)
      : 0;
  let restart: boolean | ((src: RowSources) => boolean) = false;

  if ("rowIds" in scope) {
    const map = new Map(all.map((s) => [s.contact.id, s]));
    workingSet = scope.rowIds
      .map((id) => map.get(id))
      .filter(Boolean) as RowSources[];
    scopeTotal = scope.rowIds.length;
    // Expliziter Zell-Run auf einer fertigen Zelle (Treffer/kein Treffer) startet
    // bewusst neu; ein unterbrochener Teil-Lauf ("running") wird fortgesetzt.
    restart = (src) => {
      const s = buildCells(columns, src)[column.key]?.status;
      return s === "success" || s === "not_found";
    };
  } else if (scope.mode === "force") {
    workingSet = all.slice(offset);
    scopeTotal = all.length;
    restart = true;
  } else {
    // missing: nur Zeilen mit Vorname + Nachname + Webseite, die einen Run
    // brauchen (leer/Fehler/unterbrochen). excludeRowIds = in diesem Lauf schon
    // erledigte Zeilen; nicht erneut ziehen (Endlosschleife bei Fehler-Zellen).
    const exclude = new Set(scope.excludeRowIds ?? []);
    workingSet = all.filter((src) => {
      if (exclude.has(src.contact.id)) return false;
      const cell = buildCells(columns, src)[column.key];
      return (
        !!cell &&
        emailFinderCellNeedsRun(cell) &&
        emailFinderReady(column, src) &&
        passesOnlyRunIf(onlyRunIf, src.contact)
      );
    });
    scopeTotal = workingSet.length;
  }

  const pool = await runEmailFinderPool(orgId, column, workingSet, {
    deadline,
    restart,
  });

  let succeeded = 0;
  let notFound = 0;
  let failed = 0;
  const completedIds: string[] = [];
  for (const { src, outcome } of pool.results) {
    if (outcome.status === "success") succeeded++;
    else if (outcome.status === "not_found") notFound++;
    else if (outcome.status === "error") failed++;
    // "partial" gilt nicht als erledigt — nicht melden, damit der Client die
    // Zeile erneut zieht und der Pool sie fortsetzt.
    if (outcome.status !== "partial") completedIds.push(src.contact.id);
  }

  // processed = tatsächlich BEGONNENE Zeilen (Pool bricht bei Zeitablauf ab).
  // Force-Modus rückt den Offset genau um diese vor; nicht begonnene Zeilen
  // werden im nächsten Aufruf erneut abgedeckt.
  const processed = pool.results.length;
  const remaining =
    !("rowIds" in scope) && scope.mode === "force"
      ? Math.max(0, all.length - (offset + processed))
      : Math.max(0, scopeTotal - completedIds.length);

  revalidatePath("/vertrieb/scraping");
  revalidatePath("/vertrieb");
  revalidatePath("/crm");

  return {
    processed,
    succeeded,
    notFound,
    failed,
    remaining,
    rowIds: completedIds,
    rateLimited: false,
  };
}

// ============================================================================
// HINTERGRUND-ENRICHMENT ("Update cells") — server-seitig, überlebt App-Schließen
// ============================================================================

export type EnrichmentQueueResult = {
  queued: boolean;
  pending: number;
  error?: string | null;
};

/**
 * "Update cells": markiert die Liste für Hintergrund-Enrichment und stößt den
 * Server-Drain an. Kehrt sofort zurück — die Anreicherung (Vorname/Nachname/
 * E-Mail) läuft server-seitig weiter, auch wenn die App geschlossen oder der
 * Reiter gewechselt wird.
 */
export async function queueEnrichmentAction(input: {
  listId: string;
}): Promise<EnrichmentQueueResult> {
  const org = await requireActiveOrg();
  if (!input.listId)
    return { queued: false, pending: 0, error: "Keine Kampagne ausgewählt." };

  const pending = await pendingCountForList(org.id, input.listId);
  if (pending === 0) return { queued: false, pending: 0 };

  // Läuft schon eine lebende Chain (frischer Tick)? Dann Tick NICHT zurücksetzen,
  // sonst würde der neue Anstoß eine zweite, parallele Chain starten.
  const [cur] = await db
    .select({
      tickAt: leadLists.enrichmentTickAt,
      queuedAt: leadLists.enrichmentQueuedAt,
    })
    .from(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)))
    .limit(1);
  const liveChain =
    !!cur?.tickAt && Date.now() - cur.tickAt.getTime() < ENRICH_STALE_MS;

  // Bereits eingereihte Liste behält ihren Queue-Zeitpunkt: Phase 2 (E-Mail-
  // Verifizierung) nutzt ihn als Referenz „in diesem Lauf schon versucht" —
  // ein Bump würde Fehler-Zeilen im laufenden Lauf endlos neu anstoßen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { enrichmentQueuedAt: cur?.queuedAt ?? new Date() };
  if (!liveChain) patch.enrichmentTickAt = null; // sofortige Aufnahme erlauben
  await db
    .update(leadLists)
    .set(patch)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)));

  // Nach der Antwort den Server-Drain anstoßen (blockiert die Action nicht).
  after(() => triggerEnrichmentRun({ continuation: false }));

  return { queued: true, pending };
}

export type EnrichmentStatus = {
  active: boolean; // Liste ist in der Queue (Lauf aktiv)
  pending: number; // noch offene Zeilen
};

/** Fortschritt für die Live-Anzeige — der Client pollt das, solange er offen ist. */
export async function enrichmentStatusAction(input: {
  listId: string;
}): Promise<EnrichmentStatus> {
  const org = await requireActiveOrg();
  const [row] = await db
    .select({ queuedAt: leadLists.enrichmentQueuedAt })
    .from(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)))
    .limit(1);
  const pending = await pendingCountForList(org.id, input.listId);
  return { active: !!row?.queuedAt, pending };
}

// ============================================================================
// SPALTEN-CRUD
// ============================================================================

export async function createColumnAction(input: {
  label: string;
  kind: LeadColumnKind;
  dataType: LeadDataType;
  config?: LeadColumnConfig;
  color?: string | null;
  /** Ordner, in dem die Spalte angelegt wird — sie erscheint NUR dort. Fehlt der
   *  Wert, wird die Spalte global (in jedem Ordner sichtbar) angelegt. */
  listId?: string;
}): Promise<string> {
  const org = await requireActiveOrg();
  const label = input.label?.trim() || "Neue Spalte";
  // Schlüssel org-weit eindeutig halten (Zellwerte liegen in customFields.cells[key]
  // und getColumnByKey löst org-weit auf) → alle Spalten der Org einbeziehen.
  const cols = await getColumns(org.id);
  // PIPELINE_STAGE_KEY reservieren: die synthetische "Pipeline-Phase"-Spalte
  // existiert nicht in lead_columns, ihr Key darf aber nicht vergeben werden,
  // sonst würde eine echte Spalte fälschlich als System-Spalte behandelt.
  const key = uniqueKey(
    slugKey(label),
    new Set([...cols.map((c) => c.key), PIPELINE_STAGE_KEY]),
  );
  const position = cols.reduce((m, c) => Math.max(m, c.position), -1) + 1;

  await db.insert(leadColumns).values({
    orgId: org.id,
    leadListId: input.listId ?? null,
    key,
    label,
    kind: input.kind,
    dataType: input.dataType,
    position,
    width: 180,
    pinned: false,
    color: input.color ?? null,
    hidden: false,
    config: input.config ?? {},
  });

  revalidatePath("/vertrieb/scraping");
  return key;
}

export async function updateColumnAction(input: {
  id: string;
  patch: Partial<
    Pick<
      LeadColumn,
      "label" | "width" | "pinned" | "color" | "hidden" | "dataType" | "config"
    >
  >;
}): Promise<void> {
  const org = await requireActiveOrg();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set: any = {};
  const p = input.patch;
  if (p.label !== undefined) set.label = p.label;
  if (p.width !== undefined) set.width = p.width;
  if (p.pinned !== undefined) set.pinned = p.pinned;
  if (p.color !== undefined) set.color = p.color;
  if (p.hidden !== undefined) set.hidden = p.hidden;
  if (p.dataType !== undefined) set.dataType = p.dataType;
  if (p.config !== undefined) set.config = p.config;
  if (Object.keys(set).length === 0) return;

  await db
    .update(leadColumns)
    .set(set)
    .where(and(eq(leadColumns.id, input.id), eq(leadColumns.orgId, org.id)));
  revalidatePath("/vertrieb/scraping");
}

export async function deleteColumnAction(input: { id: string }): Promise<void> {
  const org = await requireActiveOrg();
  const [col] = await db
    .select({ key: leadColumns.key })
    .from(leadColumns)
    .where(and(eq(leadColumns.id, input.id), eq(leadColumns.orgId, org.id)))
    .limit(1);
  if (!col) return;
  if (!isUserColumn({ key: col.key })) {
    throw new Error(
      "Diese Standard-Spalte kann nicht gelöscht werden — nur selbst angelegte Spalten sind löschbar.",
    );
  }
  await db
    .delete(leadColumns)
    .where(and(eq(leadColumns.id, input.id), eq(leadColumns.orgId, org.id)));
  revalidatePath("/vertrieb/scraping");
}

export async function reorderColumnsAction(input: {
  orderedIds: string[];
}): Promise<void> {
  const org = await requireActiveOrg();
  await Promise.all(
    input.orderedIds.map((id, i) =>
      db
        .update(leadColumns)
        .set({ position: i })
        .where(and(eq(leadColumns.id, id), eq(leadColumns.orgId, org.id))),
    ),
  );
  revalidatePath("/vertrieb/scraping");
}

/** Clay "Add as column": zieht ein Enrichment-Output-Feld als eigene Daten-Spalte. */
export async function addAsColumnAction(input: {
  sourceColumnKey: string;
  field: string;
  label: string;
  dataType?: LeadDataType;
  /** Ordner, in dem die Spalte erscheinen soll (nur dort). */
  listId?: string;
}): Promise<string> {
  return createColumnAction({
    label: input.label,
    kind: "data",
    dataType: input.dataType ?? "text",
    config: {
      derivedFrom: { column: input.sourceColumnKey, field: input.field },
    },
    listId: input.listId,
  });
}

// ============================================================================
// INLINE-EDIT einer Daten-Zelle
// ============================================================================

export async function editCellAction(input: {
  rowId: string;
  columnKey: string;
  value: string;
}): Promise<void> {
  const org = await requireActiveOrg();
  const col = await getColumnByKey(org.id, input.columnKey);
  // Editierbar: manuelle Daten-Spalten, Standard-Kontaktfelder (Vorname/…/E-Mail)
  // und Enrichment-/KI-Spalten (manuelle Korrektur eines angereicherten Werts).
  // NICHT editierbar: Source-Spalten (Firma … Rating), abgeleitete & Aktions-Spalten.
  const isEnrichmentCol = !!col && (col.kind === "enrichment" || !!col.config.ai);
  if (
    !col ||
    col.config.derivedFrom ||
    col.kind === "source" ||
    col.kind === "action"
  ) {
    throw new Error("Diese Zelle ist nicht editierbar.");
  }
  const value = input.value.trim();

  if (col.config.source?.startsWith("contact.")) {
    const field = col.config.source.split(".")[1];
    if (["firstName", "lastName", "email", "phone"].includes(field)) {
      await db
        .update(contacts)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ [field]: value || null } as any)
        .where(and(eq(contacts.id, input.rowId), eq(contacts.orgId, org.id)));
      revalidatePath("/vertrieb/scraping");
      return;
    }
  }

  // Enrichment/KI ODER manuelle Daten-Spalte → Wert in cells[key].
  // Bei Enrichment: vorhandene Struktur (raw/provider) aus der Zelle erhalten und
  // eine leere Eingabe als "" speichern — sonst würde die Anzeige auf den aus `raw`
  // abgeleiteten Namen zurückfallen (find_dm) und „löschen" bliebe wirkungslos.
  let prev: Record<string, unknown> = {};
  if (isEnrichmentCol) {
    const [row] = await db
      .select({ customFields: contacts.customFields })
      .from(contacts)
      .where(and(eq(contacts.id, input.rowId), eq(contacts.orgId, org.id)))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cells = (row?.customFields as any)?.cells as
      | Record<string, Record<string, unknown>>
      | undefined;
    prev = cells?.[col.key] ?? {};
  }
  const cell = {
    ...prev,
    status: value ? "success" : "empty",
    value: value || (isEnrichmentCol ? "" : null),
    runAt: new Date().toISOString(),
  };
  await db
    .update(contacts)
    .set({ customFields: cellPatch(col.key, cell) })
    .where(and(eq(contacts.id, input.rowId), eq(contacts.orgId, org.id)));
  revalidatePath("/vertrieb/scraping");
}

// ============================================================================
// VIEWS (in organizations.settings.leadViews)
// ============================================================================

export async function saveViewAction(input: {
  view: LeadView;
}): Promise<LeadView> {
  const org = await requireActiveOrg();
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = (row?.settings ?? {}) as any;
  const views = (settings.leadViews ?? []) as LeadView[];

  const view: LeadView = {
    ...input.view,
    id: input.view.id || `v_${slugKey(input.view.name)}_${views.length + 1}`,
    builtin: false,
  };
  const idx = views.findIndex((v) => v.id === view.id);
  if (idx >= 0) views[idx] = view;
  else views.push(view);

  await db
    .update(organizations)
    .set({ settings: { ...settings, leadViews: views } })
    .where(eq(organizations.id, org.id));
  revalidatePath("/vertrieb/scraping");
  return view;
}

export async function deleteViewAction(input: { id: string }): Promise<void> {
  const org = await requireActiveOrg();
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = (row?.settings ?? {}) as any;
  const views = ((settings.leadViews ?? []) as LeadView[]).filter(
    (v) => v.id !== input.id,
  );
  await db
    .update(organizations)
    .set({ settings: { ...settings, leadViews: views } })
    .where(eq(organizations.id, org.id));
  revalidatePath("/vertrieb/scraping");
}

// ============================================================================
// LISTEN / ORDNER
// ============================================================================

export async function createListAction(input: {
  name: string;
}): Promise<{ id: string }> {
  const org = await requireActiveOrg();
  const name = input.name?.trim() || "Neue Kampagne";
  const [row] = await db
    .insert(leadLists)
    .values({ orgId: org.id, name })
    .returning({ id: leadLists.id });
  revalidatePath("/vertrieb");
  return { id: row.id };
}

export async function listListsAction(): Promise<LeadList[]> {
  const org = await requireActiveOrg();

  const lists = await db
    .select({
      id: leadLists.id,
      name: leadLists.name,
      createdAt: leadLists.createdAt,
    })
    .from(leadLists)
    .where(eq(leadLists.orgId, org.id))
    .orderBy(desc(leadLists.createdAt));

  // Counts separat (robuster als korrelierte Subquery im SELECT).
  const counts = await db
    .select({
      listId: contacts.leadListId,
      n: sql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(eq(contacts.orgId, org.id))
    .groupBy(contacts.leadListId);

  const countByList = new Map<string, number>();
  for (const c of counts) if (c.listId) countByList.set(c.listId, c.n);

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    count: countByList.get(l.id) ?? 0,
    createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : null,
  }));
}

export async function renameListAction(input: {
  id: string;
  name: string;
}): Promise<void> {
  const org = await requireActiveOrg();
  const name = input.name?.trim();
  if (!name) return;
  await db
    .update(leadLists)
    .set({ name })
    .where(and(eq(leadLists.id, input.id), eq(leadLists.orgId, org.id)));
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
}

/**
 * Löscht die zum Ordner gehörende Instantly-Kampagne. Primär über die
 * gespeicherte campaignId; ist keine hinterlegt (Verknüpfung nie gesetzt oder
 * verloren gegangen), wird als Sicherheitsnetz nach einer Kampagne mit EXAKT
 * gleichem Namen gesucht und diese gelöscht — aber nur, wenn sie eindeutig ist
 * (genau ein Treffer), damit nie eine fremde/gleichnamige Kampagne erwischt wird.
 * Alles best effort: Fehler blockieren das lokale Löschen nicht.
 */
async function deleteLinkedInstantlyCampaign(
  folderName: string,
  storedCampaignId: string | null,
): Promise<void> {
  let campaignId = storedCampaignId;

  if (!campaignId) {
    // Fallback: Kampagne per Name finden (1:1-Modell: Ordnername = Kampagnenname).
    try {
      const all = await listCampaigns();
      const target = folderName.trim().toLowerCase();
      const matches = all.filter(
        (c) => (c.name ?? "").trim().toLowerCase() === target,
      );
      if (matches.length === 1) {
        campaignId = matches[0].id;
      } else if (matches.length > 1) {
        console.warn(
          `Instantly: ${matches.length} Kampagnen heißen „${folderName}" — ` +
            `mehrdeutig, überspringe Namens-Fallback-Löschung.`,
        );
      }
    } catch (err) {
      console.error("Instantly: Namens-Fallback (listCampaigns) fehlgeschlagen:", err);
    }
  }

  if (!campaignId) return;

  try {
    await deleteCampaign(campaignId);
  } catch (err) {
    console.error(
      `Instantly-Kampagne ${campaignId} konnte nicht gelöscht werden:`,
      err,
    );
  }
}

export async function deleteListAction(input: { id: string }): Promise<void> {
  const org = await requireActiveOrg();
  // Verknüpfte Instantly-Kampagne mitlöschen — best effort: schlägt der API-Call
  // fehl (Kampagne dort schon weg, Netzfehler), blockiert das nicht das lokale
  // Löschen; der Fehler landet nur im Log.
  const [list] = await db
    .select({
      name: leadLists.name,
      instantlyCampaignId: leadLists.instantlyCampaignId,
    })
    .from(leadLists)
    .where(and(eq(leadLists.id, input.id), eq(leadLists.orgId, org.id)));
  if (list) {
    await deleteLinkedInstantlyCampaign(list.name, list.instantlyCampaignId);
  }
  // Verbundene Pipeline: Deals der Ordner-Leads vorher entfernen, sonst blieben
  // beim Kontakt-Cascade verwaiste Deals (deals.contactId → SET NULL) zurück.
  const pipelineId = await linkedPipelineForList(org.id, input.id);
  if (pipelineId) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, org.id), eq(contacts.leadListId, input.id)));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db
        .delete(deals)
        .where(
          and(
            eq(deals.orgId, org.id),
            eq(deals.pipelineId, pipelineId),
            inArray(deals.contactId, ids),
          ),
        );
    }
  }
  // contacts/companies mit dieser lead_list_id werden per ON DELETE CASCADE entfernt.
  await db
    .delete(leadLists)
    .where(and(eq(leadLists.id, input.id), eq(leadLists.orgId, org.id)));
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

export async function addManualLeadAction(input: {
  listId: string;
  firma?: string;
  webseite?: string;
  telefon?: string;
  vorname?: string;
  nachname?: string;
  email?: string;
}): Promise<void> {
  const org = await requireActiveOrg();
  if (!input.listId) throw new Error("Kampagne erforderlich.");

  const firma = input.firma?.trim() || "";
  const webseite = input.webseite?.trim() || null;
  const vorname = input.vorname?.trim() || null;
  const nachname = input.nachname?.trim() || null;
  const email = input.email?.trim() || null;
  const telefon = input.telefon?.trim() || null;

  // Alle Felder sind optional — aber ein komplett leerer Lead ergibt keinen Sinn.
  if (!firma && !webseite && !vorname && !nachname && !email && !telefon)
    throw new Error("Bitte mindestens ein Feld ausfüllen.");

  // Firma ist optional. Eine Firmen-Zeile nur anlegen, wenn Firma ODER Webseite
  // angegeben wurde (die Webseite lebt in company.customFields.websiteUri);
  // sonst gehört der Kontakt zu keiner Firma (companyId bleibt null).
  let companyId: string | null = null;
  if (firma || webseite) {
    const [company] = await db
      .insert(companies)
      .values({
        orgId: org.id,
        leadListId: input.listId,
        name: firma,
        domain: extractDomain(webseite),
        customFields: { websiteUri: webseite },
      })
      .returning({ id: companies.id });
    companyId = company.id;
  }

  const [contact] = await db
    .insert(contacts)
    .values({
      orgId: org.id,
      leadListId: input.listId,
      companyId,
      firstName: vorname,
      lastName: nachname,
      email,
      phone: telefon,
      status: "lead" as const,
      source: "Manuell",
      customFields: {},
    })
    .returning({ id: contacts.id });

  // Ordner ↔ Pipeline: neuen Lead als Deal spiegeln (falls verbunden).
  await onContactsAddedToList(org.id, input.listId, [contact.id]);

  revalidatePath("/vertrieb/scraping");
  revalidatePath("/vertrieb");
}

/**
 * Ausgewählte Leads eines Ordners löschen (Sammel-Aktion aus der Lead-Tabelle).
 * Ein Lead = Kontakt + zugehörige (ordner-eigene) Firma. Es werden gelöscht:
 *  - die Deals der Kontakte in verbundenen Pipelines (sonst Geister-Deals),
 *  - die Kontakte selbst,
 *  - danach deren Firmen, sofern sie zu diesem Ordner gehören und von keinem
 *    verbleibenden Kontakt mehr genutzt werden (keine verwaisten Firmen-Zeilen).
 */
export async function bulkDeleteLeadsAction(input: {
  listId: string;
  contactIds: string[];
}): Promise<{ count: number }> {
  const org = await requireActiveOrg();
  const ids = [
    ...new Set((input.contactIds ?? []).filter((s) => typeof s === "string" && s)),
  ];
  if (!input.listId || ids.length === 0) return { count: 0 };

  // Kampagnen-Verknüpfung des Ordners bestimmen (für die Instantly-Löschung).
  const [listRow] = await db
    .select({ instantlyCampaignId: leadLists.instantlyCampaignId })
    .from(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)))
    .limit(1);

  // Nur Kontakte dieses Ordners (org-scoped) — plus ihre Firmen + E-Mails einsammeln.
  const rows = await db
    .select({
      id: contacts.id,
      companyId: contacts.companyId,
      email: contacts.email,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, org.id),
        eq(contacts.leadListId, input.listId),
        inArray(contacts.id, ids),
      ),
    );
  if (rows.length === 0) return { count: 0 };

  const contactIds = rows.map((r) => r.id);
  const companyIds = [
    ...new Set(rows.map((r) => r.companyId).filter((x): x is string => Boolean(x))),
  ];

  // 0) Wenn der Ordner eine Instantly-Kampagne hat: dieselben Leads auch in
  //    Instantly löschen (Best-Effort, VOR dem lokalen Löschen — danach wären
  //    die E-Mails weg). Fehler dürfen das lokale Löschen nie blockieren.
  if (listRow?.instantlyCampaignId) {
    // Beide möglichen Versand-Adressen je Lead: normale E-Mail UND verifizierte
    // Entscheider-E-Mail — je nach Zeitpunkt des Einspielens kann der Lead in
    // Instantly unter beiden stehen.
    const emails = rows
      .flatMap((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cell = ((r.customFields as any)?.cells ?? {})[EMAIL_FINDER_KEY];
        const fe =
          cell?.status === "success" ? String(cell.value ?? "").trim() : "";
        return [(r.email ?? "").trim(), fe];
      })
      .filter((e) => e.includes("@"));
    if (emails.length > 0) {
      try {
        await deleteLeadsByEmails(emails);
      } catch (err) {
        console.error("Instantly: Leads konnten nicht gelöscht werden:", err);
      }
    }
  }

  // 1) Deals in verbundenen Pipelines entfernen (vor dem Kontakt-Löschen).
  await deleteDealsForContacts(org.id, contactIds);

  // 2) Kontakte löschen.
  await db
    .delete(contacts)
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, contactIds)));

  // 3) Nun unbenutzte, ordner-eigene Firmen löschen (nicht solche, die noch ein
  //    anderer Kontakt referenziert).
  if (companyIds.length > 0) {
    const stillUsed = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(
        and(eq(contacts.orgId, org.id), inArray(contacts.companyId, companyIds)),
      );
    const used = new Set(stillUsed.map((r) => r.companyId).filter(Boolean));
    const orphanCompanies = companyIds.filter((id) => !used.has(id));
    if (orphanCompanies.length > 0) {
      await db
        .delete(companies)
        .where(
          and(
            eq(companies.orgId, org.id),
            eq(companies.leadListId, input.listId),
            inArray(companies.id, orphanCompanies),
          ),
        );
    }
  }

  revalidatePath("/vertrieb/scraping");
  revalidatePath("/vertrieb");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  return { count: contactIds.length };
}

// ============================================================================
// PIPELINE-VERKNÜPFUNG (Ordner ↔ Pipeline — zweiseitig synchron)
// ============================================================================

export type LinkablePipeline = {
  id: string;
  name: string;
  /**
   * Anzahl ANDERER Ordner (nicht dieser), die schon mit dieser Pipeline verbunden
   * sind. n:1 erlaubt — dient nur der Info in der Auswahl, sperrt nichts.
   */
  linkedOtherCount: number;
};

/** Auswahl fürs "Mit Pipeline verbinden"-Modal: bestehende Pipelines + aktueller Link. */
export async function listLinkablePipelinesAction(input: {
  listId: string;
}): Promise<{ pipelines: LinkablePipeline[]; linkedPipelineId: string | null }> {
  const org = await requireActiveOrg();

  const pls = await db
    .select({ id: pipelines.id, name: pipelines.name })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id))
    .orderBy(asc(pipelines.position), asc(pipelines.createdAt));

  const links = await db
    .select({ listId: leadLists.id, pipelineId: leadLists.pipelineId })
    .from(leadLists)
    .where(and(eq(leadLists.orgId, org.id), isNotNull(leadLists.pipelineId)));
  // Wie viele ANDERE Ordner hängen je Pipeline (der aktuelle zählt nicht mit)?
  const otherCountByPipeline = new Map<string, number>();
  for (const l of links) {
    if (!l.pipelineId || l.listId === input.listId) continue;
    otherCountByPipeline.set(
      l.pipelineId,
      (otherCountByPipeline.get(l.pipelineId) ?? 0) + 1,
    );
  }

  const linkedPipelineId = await linkedPipelineForList(org.id, input.listId);

  return {
    pipelines: pls.map((p) => ({
      id: p.id,
      name: p.name,
      linkedOtherCount: otherCountByPipeline.get(p.id) ?? 0,
    })),
    linkedPipelineId,
  };
}

/**
 * Verbindet einen Ordner mit einer Pipeline (bestehend ODER neu erstellt) und
 * befüllt sie erstmalig mit den Ordner-Leads (nur Ordner → Pipeline). n:1 —
 * mehrere Ordner dürfen dieselbe Pipeline speisen.
 */
export async function connectPipelineAction(input: {
  listId: string;
  pipelineId?: string;
  newPipelineName?: string;
}): Promise<{ pipelineId: string | null; error?: string | null }> {
  const org = await requireActiveOrg();
  if (!input.listId) return { pipelineId: null, error: "Kein Ordner ausgewählt." };

  const [list] = await db
    .select({ id: leadLists.id, pipelineId: leadLists.pipelineId })
    .from(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)))
    .limit(1);
  if (!list) return { pipelineId: null, error: "Ordner nicht gefunden." };

  // Ziel-Pipeline: neu erstellen oder bestehende verwenden.
  let pipelineId: string;
  if (input.newPipelineName?.trim()) {
    pipelineId = await createPipeline(input.newPipelineName.trim());
  } else if (input.pipelineId) {
    const [pl] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(
        and(eq(pipelines.id, input.pipelineId), eq(pipelines.orgId, org.id)),
      )
      .limit(1);
    if (!pl) return { pipelineId: null, error: "Pipeline nicht gefunden." };
    pipelineId = pl.id;
  } else {
    return {
      pipelineId: null,
      error: "Bitte eine Pipeline wählen oder eine neue erstellen.",
    };
  }

  // Schon mit genau dieser Pipeline verbunden? Nichts zu tun.
  if (list.pipelineId === pipelineId) {
    return { pipelineId, error: null };
  }

  // n:1 — mehrere Ordner dürfen dieselbe Pipeline speisen; keine 1:1-Sperre mehr.

  // Umhängen: Ordner-Deals aus der ALTEN Pipeline entfernen, sonst blieben dort
  // Zombie-Deals zurück (die alte Pipeline ist danach mit keinem Ordner mehr
  // verbunden, sie ließen sich nicht mehr synchronisieren/aufräumen).
  if (list.pipelineId) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, org.id), eq(contacts.leadListId, input.listId)));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db
        .delete(deals)
        .where(
          and(
            eq(deals.orgId, org.id),
            eq(deals.pipelineId, list.pipelineId),
            inArray(deals.contactId, ids),
          ),
        );
    }
  }

  await db
    .update(leadLists)
    .set({ pipelineId })
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)));
  await backfillListToPipeline(org.id, input.listId, pipelineId);

  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  return { pipelineId, error: null };
}

/** Trennt die Verbindung. Deals bleiben in der Pipeline (nicht destruktiv). */
export async function disconnectPipelineAction(input: {
  listId: string;
}): Promise<void> {
  const org = await requireActiveOrg();
  await db
    .update(leadLists)
    .set({ pipelineId: null })
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)));
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}

/**
 * Setzt die Pipeline-Phase eines Ordner-Leads (Zell-Dropdown der "Pipeline-Phase"-
 * Spalte). Verschiebt den Deal des Leads auf die gewählte Phase.
 */
export async function setLeadStageAction(input: {
  contactId: string;
  stageId: string;
}): Promise<{ error?: string | null }> {
  const org = await requireActiveOrg();

  const [c] = await db
    .select({ id: contacts.id, leadListId: contacts.leadListId })
    .from(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.orgId, org.id)))
    .limit(1);
  if (!c || !c.leadListId) return { error: "Lead nicht gefunden." };

  const pipelineId = await linkedPipelineForList(org.id, c.leadListId);
  if (!pipelineId)
    return { error: "Ordner ist mit keiner Pipeline verbunden." };

  // Phase muss zu genau dieser Pipeline gehören (org-scoped).
  const [stage] = await db
    .select({ pipelineId: pipelineStages.pipelineId })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .where(
      and(eq(pipelineStages.id, input.stageId), eq(pipelines.orgId, org.id)),
    )
    .limit(1);
  if (!stage || stage.pipelineId !== pipelineId)
    return { error: "Phase gehört nicht zur verbundenen Pipeline." };

  await setContactDealStage(org.id, input.contactId, pipelineId, input.stageId);

  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
  return { error: null };
}

// ============================================================================
// INSTANTLY (Phase 2): Kampagne einrichten (Copy + Leads senden)
// ============================================================================
// Modell: jede Liste IST eine Kampagne (1:1-Link lead_lists.instantly_campaign_id).
// Die Instantly-Kampagne wird beim ersten Einrichten lazy angelegt.

const INSTANTLY_BATCH = 100; // Leads pro Server-Action-Aufruf (Free-Tier-freundlich)

/** Verifizierte Entscheider-E-Mail (Spalte Email_Entscheider), falls gefunden. */
function finderEmail(src: RowSources): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cells = (src.contact.customFields?.cells ?? {}) as Record<string, any>;
  const cell = cells[EMAIL_FINDER_KEY];
  if (cell?.status !== "success") return null;
  const v = String(cell.value ?? "").trim();
  return v.includes("@") ? v.toLowerCase() : null;
}

/**
 * Die Adresse, an die gesendet wird — feste Regel:
 * Entscheider-E-Mail gewinnt immer, sonst die normale E-Mail; ohne beides null
 * (Lead wird übersprungen).
 */
function sendableEmail(src: RowSources): string | null {
  const fe = finderEmail(src);
  if (fe) return fe;
  const e = (src.contact.email ?? "").trim();
  return e.includes("@") ? e.toLowerCase() : null;
}

function rowSentTo(src: RowSources, campaignId: string): boolean {
  const camps = (src.contact.customFields?.instantly?.campaigns ?? {}) as Record<
    string,
    unknown
  >;
  return !!camps[campaignId];
}

function buildInstantlyLead(
  src: RowSources,
  columns: LeadColumn[],
): InstantlyLead {
  const c = src.contact;
  const co = src.company;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cf = (co?.customFields ?? {}) as Record<string, any>;
  const cells = buildCells(columns, src);

  // Namen robust bestimmen: Kontakt-Feld zuerst, sonst aus der Enrichment-Zelle
  // ("Geschäftsführer finden") — so gehen Vor-/Nachname NIE verloren, auch wenn
  // der Rückschreib-Schritt mal nicht griff.
  const dmRaw = (cells[ENRICHMENT_KEY]?.raw ?? {}) as {
    vorname?: unknown;
    nachname?: unknown;
  };
  const dmFirst =
    typeof dmRaw.vorname === "string" && dmRaw.vorname.toUpperCase() !== "NF"
      ? dmRaw.vorname
      : "";
  const dmLast =
    typeof dmRaw.nachname === "string" && dmRaw.nachname.toUpperCase() !== "NF"
      ? dmRaw.nachname
      : "";
  const firstName = c.firstName || dmFirst || "";
  const lastName = c.lastName || dmLast || "";
  const companyName = co?.name ?? "";

  // ALLE Spalten IMMER als custom_variables mitschieben — auch leere (""), damit
  // jedes {{token}} in Instantly garantiert existiert und keine Variable je still
  // verloren geht.
  const custom: Record<string, string> = {};
  const setVar = (token: string, v: unknown) => {
    custom[token] = v === null || v === undefined ? "" : String(v);
  };
  for (const col of columns) {
    setVar(instantlyVarToken(col.key), cells[col.key]?.value);
  }
  // Name/Firma unter BEIDEN Schreibweisen setzen: Instantly-Standard ist camelCase
  // ({{firstName}}), ältere App-Copy nutzt aber snake_case ({{first_name}}). So löst
  // beides zuverlässig auf. Robuster Namenswert (inkl. Enrichment-Fallback) gewinnt.
  setVar("firstName", firstName);
  setVar("first_name", firstName);
  setVar("lastName", lastName);
  setVar("last_name", lastName);
  setVar("companyName", companyName);
  setVar("company_name", companyName);
  // {{email}} zeigt immer die Adresse, an die tatsächlich gesendet wird
  // (Entscheider-E-Mail vor normaler E-Mail).
  const sendTo = sendableEmail(src) ?? "";
  setVar("email", sendTo);
  // niche/city aus company-customFields ergänzen, falls keine eigene Spalte.
  if (cf.niche && !custom.niche) custom.niche = String(cf.niche);
  if (cf.city && !custom.city) custom.city = String(cf.city);

  return {
    email: sendTo,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    company_name: co?.name || undefined,
    website: (cf.websiteUri as string) || co?.domain || undefined,
    phone: c.phone || undefined,
    custom_variables: Object.keys(custom).length ? custom : undefined,
  };
}

/** jsonb-Merge: markiert customFields.instantly.campaigns[campaignId] = iso. */
function sentPatch(campaignId: string, iso: string) {
  const camp = JSON.stringify({ [campaignId]: iso });
  return sql`coalesce(${contacts.customFields}, '{}'::jsonb) || jsonb_build_object('instantly', coalesce(${contacts.customFields} -> 'instantly', '{}'::jsonb) || jsonb_build_object('campaigns', coalesce(${contacts.customFields} -> 'instantly' -> 'campaigns', '{}'::jsonb) || ${camp}::jsonb))`;
}

async function getListCampaign(
  orgId: string,
  listId: string,
): Promise<{ name: string; campaignId: string | null } | null> {
  const [row] = await db
    .select({ name: leadLists.name, cid: leadLists.instantlyCampaignId })
    .from(leadLists)
    .where(and(eq(leadLists.id, listId), eq(leadLists.orgId, orgId)))
    .limit(1);
  return row ? { name: row.name, campaignId: row.cid ?? null } : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plaintext (mit {{variablen}}) → einfaches HTML, das Instantly erwartet. */
function textToHtml(text: string): string {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((l) =>
      l.trim() === "" ? "<div><br></div>" : `<div>${escapeHtml(l)}</div>`,
    )
    .join("");
}

/** HTML → Plaintext für das Prefill des Editors. */
function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<div><br\s*\/?><\/div>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>\s*<div>/gi, "\n")
    .replace(/<\/?div[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function buildSequences(steps: CampaignStep[]): InstantlySequence[] {
  const valid = steps.filter((s) => s.subject.trim() || s.body.trim());
  return [
    {
      steps: valid.map((s) => ({
        type: "email" as const,
        delay: Math.max(0, Math.floor(Number(s.delayDays) || 0)),
        variants: [{ subject: s.subject, body: textToHtml(s.body) }],
      })),
    },
  ];
}

function parseSteps(sequences: InstantlySequence[]): CampaignStep[] {
  const steps = sequences?.[0]?.steps ?? [];
  const out = steps.map((st) => {
    const v = st.variants?.[0] ?? { subject: "", body: "" };
    return {
      subject: v.subject ?? "",
      body: htmlToText(v.body ?? ""),
      delayDays: typeof st.delay === "number" ? st.delay : 0,
    };
  });
  return out.length ? out : [{ subject: "", body: "", delayDays: 0 }];
}

async function computePreview(
  orgId: string,
  listId: string,
  campaignId: string | null,
  filter: InstantlySendFilter,
): Promise<InstantlySendPreview> {
  const all = await loadLeadRows(orgId, listId);
  let withEmail = 0;
  let noEmail = 0;
  let withFinderEmail = 0;
  let alreadySent = 0;
  let eligible = 0;
  for (const src of all) {
    // Feste Regel: Entscheider-E-Mail gewinnt, sonst normale E-Mail; ohne
    // beides wird der Lead übersprungen.
    if (!sendableEmail(src)) {
      noEmail++;
      continue;
    }
    withEmail++;
    if (finderEmail(src)) withFinderEmail++;
    const sent = campaignId ? rowSentTo(src, campaignId) : false;
    if (sent) alreadySent++;
    if (filter.skipAlreadySent && sent) continue;
    eligible++;
  }
  return {
    total: all.length,
    withEmail,
    noEmail,
    withFinderEmail,
    alreadySent,
    eligible,
  };
}

/** Vorbefüllung für den Assistenten: Copy, Absender, Vorschau. */
export async function getCampaignSetupAction(input: {
  listId: string;
}): Promise<CampaignSetupInfo> {
  const org = await requireActiveOrg();
  const list = await getListCampaign(org.id, input.listId);
  if (!list) throw new Error("Kampagne nicht gefunden.");

  let accounts: CampaignSenderAccount[] = [];
  try {
    const accs = await listAccounts();
    accounts = accs.map((a) => ({
      email: a.email,
      active: a.status === 1,
      warmupScore: a.warmupScore,
    }));
  } catch {
    accounts = [];
  }

  let steps: CampaignStep[] = [{ subject: "", body: "", delayDays: 0 }];
  let status: number | null = null;
  if (list.campaignId) {
    try {
      const c = await getCampaign(list.campaignId);
      status = c.status;
      steps = parseSteps(c.sequences);
    } catch {
      // Kampagne evtl. in Instantly gelöscht → wie neu behandeln.
    }
  }

  const preview = await computePreview(org.id, input.listId, list.campaignId, {
    skipAlreadySent: true,
    skipWorkspaceDuplicates: false,
  });

  return { campaignId: list.campaignId, status, steps, accounts, preview };
}

export async function previewInstantlySendAction(input: {
  listId: string;
  filter: InstantlySendFilter;
}): Promise<InstantlySendPreview> {
  const org = await requireActiveOrg();
  const list = await getListCampaign(org.id, input.listId);
  return computePreview(
    org.id,
    input.listId,
    list?.campaignId ?? null,
    input.filter,
  );
}

/** Copy als Sequenz speichern (create/update), Absender setzen, optional aktivieren. */
export async function saveCampaignAction(input: {
  listId: string;
  steps: CampaignStep[];
  senders: string[];
  activate: boolean;
}): Promise<SaveCampaignResult> {
  const org = await requireActiveOrg();
  const list = await getListCampaign(org.id, input.listId);
  if (!list)
    return {
      campaignId: null,
      activated: false,
      error: "Kampagne nicht gefunden.",
    };

  const sequences = buildSequences(input.steps);
  if (!sequences[0].steps.length) {
    return {
      campaignId: list.campaignId,
      activated: false,
      error: "Bitte mindestens Betreff oder Text der ersten Mail ausfüllen.",
    };
  }

  try {
    let campaignId = list.campaignId;
    if (campaignId) {
      await updateCampaign(campaignId, {
        sequences,
        emailList: input.senders,
      });
    } else {
      const created = await createCampaign({
        name: list.name,
        sequences,
        emailList: input.senders,
      });
      campaignId = created.id;
      await db
        .update(leadLists)
        .set({ instantlyCampaignId: campaignId })
        .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, org.id)));
    }

    let activated = false;
    if (input.activate && campaignId) {
      await activateCampaign(campaignId);
      activated = true;
    }

    revalidatePath("/vertrieb");
    revalidatePath("/vertrieb/scraping");
    return { campaignId, activated, error: null };
  } catch (e) {
    return {
      campaignId: list.campaignId,
      activated: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

/**
 * Kampagne live schalten (activate) oder auf Draft setzen (pause). Bewusst
 * getrennt von saveCampaignAction, damit die Aktivierung ERST nach dem Einspielen
 * der Leads passiert (Instantly startet sonst eine leere Kampagne).
 */
export async function setInstantlyCampaignLiveAction(input: {
  listId: string;
  live: boolean;
}): Promise<{ live: boolean; error: string | null }> {
  const org = await requireActiveOrg();
  const list = await getListCampaign(org.id, input.listId);
  if (!list?.campaignId) {
    return { live: false, error: "Kampagne wurde noch nicht angelegt." };
  }
  try {
    if (input.live) {
      await activateCampaign(list.campaignId);
    } else {
      await pauseCampaign(list.campaignId);
    }
    revalidatePath("/vertrieb");
    revalidatePath("/vertrieb/scraping");
    return { live: input.live, error: null };
  } catch (e) {
    return {
      live: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

export async function sendListToInstantlyAction(input: {
  listId: string;
  filter: InstantlySendFilter;
  offset?: number;
}): Promise<InstantlySendResult> {
  const org = await requireActiveOrg();
  const base: InstantlySendResult = {
    processed: 0,
    sent: 0,
    updated: 0,
    skippedNoEmail: 0,
    skippedAlreadySent: 0,
    skippedDuplicate: 0,
    failed: 0,
    remaining: 0,
    error: null,
  };
  if (!input.listId) return { ...base, error: "Keine Kampagne ausgewählt." };

  const list = await getListCampaign(org.id, input.listId);
  if (!list?.campaignId) {
    return { ...base, error: "Kampagne in Instantly noch nicht eingerichtet." };
  }
  const campaignId = list.campaignId;

  try {
    // offset läuft stabil über ALLE Zeilen (Markieren verschiebt das Slicing nicht).
    const all = await loadLeadRows(org.id, input.listId);
    const columns = await getColumns(org.id, input.listId);
    const offset = Math.max(0, input.offset ?? 0);
    const slice = all.slice(offset, offset + INSTANTLY_BATCH);

    // Neue Leads werden angelegt, bereits vorhandene AUFGEFRISCHT (nicht bloß
    // übersprungen): so stehen in Instantly IMMER alle Spalten aktuell — auch wenn
    // ein Lead früher unvollständig eingespielt wurde. /leads/add aktualisiert
    // bestehende Leads nämlich nicht, deshalb der PATCH-Weg pro vorhandenem Lead.
    const toAdd: RowSources[] = [];
    const toUpdate: RowSources[] = [];
    let skippedNoEmail = 0;
    for (const src of slice) {
      // Feste Regel: Entscheider-E-Mail gewinnt, sonst normale E-Mail; ohne
      // beides wird der Lead übersprungen.
      if (!sendableEmail(src)) {
        skippedNoEmail++;
        continue;
      }
      if (rowSentTo(src, campaignId)) toUpdate.push(src);
      else toAdd.push(src);
    }

    // Duplikat-Check über Kampagnengrenzen: Leads, die in Instantly schon in
    // einer ANDEREN Kampagne stecken, werden übersprungen (nur wenn gewünscht).
    // Innerhalb derselben Kampagne dedupliziert /leads/add ohnehin immer.
    let skippedDuplicate = 0;
    let addRows = toAdd;
    if (input.filter.skipWorkspaceDuplicates && toAdd.length > 0) {
      const keep: RowSources[] = [];
      const CHUNK = 10; // parallele Lookups begrenzen (Instantly-Rate-Limit)
      for (let i = 0; i < toAdd.length; i += CHUNK) {
        const chunk = toAdd.slice(i, i + CHUNK);
        const inOther = await Promise.all(
          chunk.map(async (src) => {
            const email = sendableEmail(src) ?? "";
            const campaigns = await findLeadCampaignsByEmail(email);
            return campaigns.some((c) => c !== campaignId);
          }),
        );
        chunk.forEach((src, j) => {
          if (inOther[j]) skippedDuplicate++;
          else keep.push(src);
        });
      }
      addRows = keep;
    }

    let sent = 0;
    let updated = 0;
    let failed = 0;
    let error: string | null = null;
    // Erfolgreich eingespielte/aufgefrischte Leads — für die Pipeline-Automatik.
    const pushedIds: string[] = [];

    const markSent = async (rows: RowSources[]) => {
      if (!rows.length) return;
      await db
        .update(contacts)
        .set({ customFields: sentPatch(campaignId, new Date().toISOString()) })
        .where(
          and(
            eq(contacts.orgId, org.id),
            inArray(
              contacts.id,
              rows.map((s) => s.contact.id),
            ),
          ),
        );
    };

    // 1) Neue Leads einspielen — immer mit ALLEN Spalten (siehe buildInstantlyLead).
    // skipIfInWorkspace doppelt als Server-Absicherung zum obigen Duplikat-Check.
    if (addRows.length > 0) {
      try {
        await bulkAddLeads(
          campaignId,
          addRows.map((s) => buildInstantlyLead(s, columns)),
          {
            skipIfInCampaign: true,
            skipIfInWorkspace: input.filter.skipWorkspaceDuplicates,
          },
        );
        sent = addRows.length;
        await markSent(addRows);
        pushedIds.push(...addRows.map((s) => s.contact.id));
      } catch (e) {
        failed += addRows.length;
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    }

    // 2) Bereits eingespielte Leads auffrischen (Spalten/Variablen per PATCH).
    if (!error) {
      for (const src of toUpdate) {
        const lead = buildInstantlyLead(src, columns);
        try {
          const id = await findLeadIdByEmail(lead.email);
          if (id) {
            await updateLead(id, lead);
            updated++;
            pushedIds.push(src.contact.id);
          } else {
            // Laut DB gesendet, in Instantly aber nicht (mehr) vorhanden → neu anlegen.
            await bulkAddLeads(campaignId, [lead], { skipIfInCampaign: true });
            sent++;
            await markSent([src]);
            pushedIds.push(src.contact.id);
          }
        } catch (e) {
          failed++;
          error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          break;
        }
      }
    }

    // Automatik: tatsächlich in die Kampagne geschobene Leads → Pipeline-Phase
    // "in Kampagne" (nur wenn der Ordner verbunden ist; best effort, blockiert
    // den Push nie).
    if (pushedIds.length > 0) {
      try {
        await autoAdvanceListLeads(org.id, input.listId, pushedIds, "in Kampagne");
      } catch (e) {
        console.error("Pipeline-Phase 'in Kampagne' setzen fehlgeschlagen:", e);
      }
    }

    // Bei Fehler abbrechen (remaining=0), sonst weiter bis zum Listenende.
    const remaining = error
      ? 0
      : Math.max(0, all.length - (offset + slice.length));

    return {
      processed: slice.length,
      sent,
      updated,
      skippedNoEmail,
      skippedAlreadySent: 0,
      skippedDuplicate,
      failed,
      remaining,
      error,
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}
