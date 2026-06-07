"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contacts, companies, organizations, leadColumns } from "@/db/schema";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { searchPlaces, extractDomain } from "@/lib/server/scraping/places";
import { runProvider } from "@/lib/server/scraping/providers";
import { runAiColumn } from "@/lib/server/scraping/ai-column";
import {
  ensureDefaultColumns,
  getColumns,
  getColumnByKey,
  buildCells,
  resolveRowPath,
  cellNeedsRun,
  passesOnlyRunIf,
  BUILTIN_VIEWS,
  ENRICHMENT_KEY,
  type RowSources,
} from "@/lib/server/scraping/lead-columns";
import type {
  LeadColumn,
  LeadColumnConfig,
  LeadColumnKind,
  LeadDataType,
  LeadTableData,
  LeadView,
  RunBatchResult,
  RunScope,
} from "@/lib/scraping-types";

const SOURCE = "Google Maps";
const MAX_ROWS = 1000; // Phase-1-Cap (ein Kunde); Server-Pagination = Phase 2.

// ============================================================================
// Hilfen
// ============================================================================

async function loadLeadRows(
  orgId: string,
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
    .where(and(eq(contacts.orgId, orgId), eq(contacts.source, SOURCE)))
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
function cellPatch(columnKey: string, cell: Record<string, unknown>) {
  const patch = JSON.stringify({ [columnKey]: cell });
  return sql`coalesce(${contacts.customFields}, '{}'::jsonb) || jsonb_build_object('cells', coalesce(${contacts.customFields} -> 'cells', '{}'::jsonb) || ${patch}::jsonb)`;
}

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
}): Promise<ScrapeResult> {
  const niche = input.niche?.trim() ?? "";
  const city = input.city?.trim() ?? "";
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
      .where(eq(companies.orgId, org.id));
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

    await db.insert(contacts).values(
      fresh.map((p) => ({
        orgId: org.id,
        companyId: companyByPlace.get(p.placeId) ?? null,
        phone: p.phone,
        status: "lead" as const,
        source: SOURCE,
        customFields: {},
      })),
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

export async function listLeadTableAction(): Promise<LeadTableData> {
  const org = await requireActiveOrg();
  const columns = await ensureDefaultColumns(org.id);

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.source, SOURCE)));

  const srcs = await loadLeadRows(org.id);
  const rows = srcs.map((src) => ({
    id: src.contact.id,
    companyId: src.contact.companyId,
    cells: buildCells(columns, src),
  }));

  const views = [...BUILTIN_VIEWS, ...(await getOrgViews(org.id))];

  return { columns, rows, total: totalRow?.total ?? 0, views };
}

// ============================================================================
// ENRICHMENT-RUN (Zelle / Auswahl / Spalte / alle) — unterer n8n-Workflow
// ============================================================================

async function runEnrichmentForRow(
  orgId: string,
  column: LeadColumn,
  src: RowSources,
  columns: LeadColumn[],
): Promise<"success" | "not_found" | "error"> {
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
      return found ? "success" : "not_found";
    } catch (e) {
      const cell = {
        status: "error",
        provider: null,
        runAt,
        error: e instanceof Error ? e.message.slice(0, 300) : "Fehler",
        value: "",
        raw: null,
      };
      await db
        .update(contacts)
        .set({ customFields: cellPatch(column.key, cell) })
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return "error";
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
      return "success";
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
    return "not_found";
  } catch (e) {
    const cell = {
      status: "error",
      provider: null,
      runAt: new Date().toISOString(),
      error: e instanceof Error ? e.message.slice(0, 300) : "Fehler",
      value: "",
      raw: null,
    };
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
    return "error";
  }
}

export async function runEnrichmentBatchAction(input: {
  columnKey: string;
  scope: RunScope;
}): Promise<RunBatchResult> {
  const org = await requireActiveOrg();
  const column = await getColumnByKey(org.id, input.columnKey);
  if (!column || (column.kind !== "enrichment" && !column.config.ai)) {
    throw new Error("Spalte ist keine Enrichment-/KI-Spalte.");
  }

  const columns = await getColumns(org.id);
  const all = await loadLeadRows(org.id);
  const limit = clamp(
    ("limit" in input.scope ? input.scope.limit : undefined) ?? 4,
    1,
    8,
  );

  let toProcess: RowSources[] = [];
  let remaining = 0;

  if ("rowIds" in input.scope) {
    const map = new Map(all.map((s) => [s.contact.id, s]));
    const ordered = input.scope.rowIds
      .map((id) => map.get(id))
      .filter(Boolean) as RowSources[];
    toProcess = ordered.slice(0, limit);
    remaining = Math.max(0, input.scope.rowIds.length - toProcess.length);
  } else if (input.scope.mode === "force") {
    const offset = Math.max(0, input.scope.offset ?? 0);
    toProcess = all.slice(offset, offset + limit);
    remaining = Math.max(0, all.length - (offset + toProcess.length));
  } else {
    // missing: nur Zellen, die einen Run brauchen + "Only run if"
    const onlyRunIf = column.config.runSettings?.onlyRunIf;
    const candidates = all.filter((src) => {
      const cell = buildCells(columns, src)[column.key];
      return cellNeedsRun(cell) && passesOnlyRunIf(onlyRunIf, src.contact);
    });
    toProcess = candidates.slice(0, limit);
    remaining = Math.max(0, candidates.length - toProcess.length);
  }

  const results = await Promise.all(
    toProcess.map((src) => runEnrichmentForRow(org.id, column, src, columns)),
  );

  let succeeded = 0;
  let notFound = 0;
  let failed = 0;
  for (const r of results) {
    if (r === "success") succeeded++;
    else if (r === "not_found") notFound++;
    else failed++;
  }

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
  };
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
}): Promise<string> {
  const org = await requireActiveOrg();
  const label = input.label?.trim() || "Neue Spalte";
  const cols = await getColumns(org.id);
  const key = uniqueKey(slugKey(label), new Set(cols.map((c) => c.key)));
  const position = cols.reduce((m, c) => Math.max(m, c.position), -1) + 1;

  await db.insert(leadColumns).values({
    orgId: org.id,
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
}): Promise<string> {
  return createColumnAction({
    label: input.label,
    kind: "data",
    dataType: input.dataType ?? "text",
    config: {
      derivedFrom: { column: input.sourceColumnKey, field: input.field },
    },
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
  if (!col || col.kind !== "data" || col.config.derivedFrom) {
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

  // Manuelle Daten-Spalte → Wert in cells[key].
  const cell = {
    status: value ? "success" : "empty",
    value: value || null,
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
