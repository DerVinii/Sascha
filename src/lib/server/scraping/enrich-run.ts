/**
 * Enrichment-Kernlogik — geteilt zwischen Server-Actions (Vordergrund-Runs aus
 * dem Spaltenmenü / Auswahl) und der Hintergrund-Route (/api/enrichment/run).
 *
 * Der Hintergrund-Drain verarbeitet Listen mit gesetztem `enrichmentQueuedAt`
 * server-seitig in Chargen — unabhängig davon, ob der Client noch offen ist.
 */

import { db } from "@/db";
import { contacts, companies, leadLists } from "@/db/schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  buildCells,
  cellNeedsRun,
  getColumnByKey,
  getColumns,
  passesOnlyRunIf,
  resolveRowPath,
  ENRICHMENT_KEY,
  type RowSources,
} from "./lead-columns";
import { runProvider } from "./providers";
import { runAiColumn } from "./ai-column";
import type { LeadColumn } from "@/lib/scraping-types";

export const MAX_ROWS = 1000; // Phase-1-Cap (ein Kunde)

export type RowOutcome = {
  status: "success" | "not_found" | "error";
  /** Fehler war ein Gemini-Kontingent-/Rate-Limit-Fehler (429). */
  rateLimited?: boolean;
};

/** Erkennt Gemini-429/Kontingent-Fehler an der Fehlermeldung. */
export function isRateLimitError(msg: string): boolean {
  return /\b429\b|quota|rate[ _-]?limit|RESOURCE_EXHAUSTED/i.test(msg);
}

export async function loadLeadRows(
  orgId: string,
  listId: string,
  limit = MAX_ROWS,
): Promise<RowSources[]> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      companyId: contacts.companyId,
      contactCf: contacts.customFields,
      companyName: companies.name,
      companyDomain: companies.domain,
      companyAddress: companies.address,
      companyCf: companies.customFields,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.orgId, orgId), eq(contacts.leadListId, listId)))
    .orderBy(desc(contacts.createdAt), asc(contacts.id))
    .limit(limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    contact: {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      companyId: r.companyId,
      customFields: r.contactCf ?? {},
    },
    company: r.companyId
      ? {
          name: r.companyName,
          domain: r.companyDomain,
          address: r.companyAddress ?? null,
          customFields: r.companyCf ?? {},
        }
      : null,
  }));
}

/** jsonb-Merge, der cells[columnKey] setzt und alles andere erhält. */
export function cellPatch(columnKey: string, cell: Record<string, unknown>) {
  const patch = JSON.stringify({ [columnKey]: cell });
  return sql`coalesce(${contacts.customFields}, '{}'::jsonb) || jsonb_build_object('cells', coalesce(${contacts.customFields} -> 'cells', '{}'::jsonb) || ${patch}::jsonb)`;
}

export async function runEnrichmentForRow(
  orgId: string,
  column: LeadColumn,
  src: RowSources,
  columns: LeadColumn[],
): Promise<RowOutcome> {
  // "Mit KI ausfüllen" (Claygent): freier Prompt pro Zeile, Modell fest.
  if (column.config.ai?.prompt) {
    const runAt = new Date().toISOString();
    try {
      const cellsNow = buildCells(columns, src);
      const ctx: Record<string, unknown> = {};
      for (const c of columns) {
        if (c.key === column.key) continue;
        const v = cellsNow[c.key]?.value;
        if (v !== null && v !== undefined && v !== "") ctx[c.label] = v;
      }
      const value = await runAiColumn(column.config.ai.prompt, ctx);
      const found = value.toUpperCase() !== "NF" && value.trim() !== "";
      const cell = {
        status: found ? "success" : "not_found",
        provider: "gemini",
        runAt,
        error: null,
        value: found ? value : "",
        raw: { prompt: column.config.ai.prompt, value },
      };
      await db
        .update(contacts)
        .set({ customFields: cellPatch(column.key, cell) })
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: found ? "success" : "not_found" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Fehler";
      const cell = {
        status: "error",
        provider: null,
        runAt,
        error: message.slice(0, 300),
        value: "",
        raw: null,
      };
      await db
        .update(contacts)
        .set({ customFields: cellPatch(column.key, cell) })
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: "error", rateLimited: isRateLimitError(message) };
    }
  }

  const inputs = column.config.inputs ?? {};
  const firmenname = String(
    resolveRowPath(inputs["Firmenname"] ?? "company.name", src) ?? "",
  );
  const webseite = resolveRowPath(
    inputs["Webseite"] ?? "company.customFields.websiteUri",
    src,
  ) as string | null;
  const gmapsUrl = resolveRowPath(
    inputs["Google Maps Link"] ?? "company.customFields.googleMapsUri",
    src,
  ) as string | null;

  const chain = column.config.provider ?? ["gemini"];

  try {
    const { provider, result } = await runProvider(chain, {
      firmenname,
      webseite,
      gmapsUrl,
    });
    const runAt = new Date().toISOString();

    if (result.found) {
      const firstName =
        result.vorname.toUpperCase() === "NF" ? null : result.vorname;
      const lastName =
        result.nachname.toUpperCase() === "NF" ? null : result.nachname;
      const email =
        result.email.toUpperCase() === "NF" || !result.email.includes("@")
          ? null
          : result.email.toLowerCase();

      const cell = {
        status: "success",
        provider,
        runAt,
        error: null,
        value: [firstName, lastName].filter(Boolean).join(" ") || email || "",
        raw: { vorname: firstName, nachname: lastName, email },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set: any = { customFields: cellPatch(column.key, cell) };
      // Nur die kanonische Enrichment schreibt in die Kontakt-Felder zurück.
      if (column.key === ENRICHMENT_KEY) {
        set.firstName = firstName;
        set.lastName = lastName;
        set.email = email;
      }
      await db
        .update(contacts)
        .set(set)
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: "success" };
    }

    const cell = {
      status: "not_found",
      provider: null,
      runAt,
      error: null,
      value: "",
      raw: { vorname: "NF", nachname: "NF", email: "NF" },
    };
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
    return { status: "not_found" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    const cell = {
      status: "error",
      provider: null,
      runAt: new Date().toISOString(),
      error: message.slice(0, 300),
      value: "",
      raw: null,
    };
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
    return { status: "error", rateLimited: isRateLimitError(message) };
  }
}

/** Zeilen einer Liste, die noch angereichert werden müssen (Name leer + Run nötig). */
function missingRows(column: LeadColumn, columns: LeadColumn[], all: RowSources[]) {
  const onlyRunIf = column.config.runSettings?.onlyRunIf;
  return all.filter((src) => {
    const cell = buildCells(columns, src)[column.key];
    return cellNeedsRun(cell) && passesOnlyRunIf(onlyRunIf, src.contact);
  });
}

/** Wie viele Zeilen einer Liste noch offen sind (für Status/Fortschritt). */
export async function pendingCountForList(
  orgId: string,
  listId: string,
): Promise<number> {
  const column = await getColumnByKey(orgId, ENRICHMENT_KEY);
  if (!column) return 0;
  const columns = await getColumns(orgId);
  const all = await loadLeadRows(orgId, listId);
  return missingRows(column, columns, all).length;
}

export type DrainSummary = {
  processedRows: number;
  anyRemaining: boolean; // es gibt noch offene Arbeit -> Chain fortsetzen
  rateLimited: boolean;
};

/** Wie lange gilt eine Liste als „von einem lebenden Worker bearbeitet". */
export const ENRICH_STALE_MS = 3 * 60 * 1000;

/**
 * Verarbeitet Listen mit gesetztem enrichmentQueuedAt server-seitig in Chargen,
 * bis das Zeitbudget erschöpft ist. `isContinuation` = true bei Self-Chain-Hops
 * (immer weiterarbeiten); false bei Cron/Erst-Kick (nur „tote" Läufe aufnehmen).
 */
export async function drainQueuedLists(opts: {
  budgetMs: number;
  isContinuation: boolean;
}): Promise<DrainSummary> {
  const start = Date.now();
  const deadline = start + opts.budgetMs;
  let processedRows = 0;
  let anyRemaining = false;
  let rateLimited = false;

  const queued = await db
    .select({
      id: leadLists.id,
      orgId: leadLists.orgId,
      tickAt: leadLists.enrichmentTickAt,
    })
    .from(leadLists)
    .where(isNotNull(leadLists.enrichmentQueuedAt))
    .orderBy(asc(leadLists.enrichmentQueuedAt));

  for (const list of queued) {
    // Cron/Erst-Kick: aktive Chains (frischer Tick) nicht doppeln. Bewusst OHNE
    // anyRemaining=true — die laufende Chain kümmert sich selbst, ein zusätzlicher
    // Continuation-Hop von hier würde die Verarbeitung verdoppeln.
    if (!opts.isContinuation) {
      const fresh =
        list.tickAt && Date.now() - list.tickAt.getTime() < ENRICH_STALE_MS;
      if (fresh) continue;
    }
    if (Date.now() >= deadline) {
      anyRemaining = true;
      break;
    }

    // Tick setzen (Heartbeat + Sperre gegen Cron-Doppelung).
    await db
      .update(leadLists)
      .set({ enrichmentTickAt: new Date() })
      .where(eq(leadLists.id, list.id));

    const column = await getColumnByKey(list.orgId, ENRICHMENT_KEY);
    if (!column) {
      // Keine Engine-Spalte -> Liste aus der Queue nehmen.
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
      continue;
    }
    const columns = await getColumns(list.orgId);
    const all = await loadLeadRows(list.orgId, list.id);
    const missing = missingRows(column, columns, all);

    let i = 0;
    for (; i < missing.length; i++) {
      if (Date.now() >= deadline) break;
      const outcome = await runEnrichmentForRow(
        list.orgId,
        column,
        missing[i],
        columns,
      );
      processedRows++;
      if (outcome.rateLimited) {
        rateLimited = true;
        break;
      }
    }

    // Heartbeat nachziehen.
    await db
      .update(leadLists)
      .set({ enrichmentTickAt: new Date() })
      .where(eq(leadLists.id, list.id));

    if (rateLimited) {
      // Kontingent erschöpft: Lauf abbrechen (Client-Neustart nötig).
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
      break;
    }
    if (i >= missing.length) {
      // Liste fertig -> aus der Queue nehmen.
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
    } else {
      anyRemaining = true; // Budget erschöpft, Zeilen offen
    }
  }

  return { processedRows, anyRemaining, rateLimited };
}
