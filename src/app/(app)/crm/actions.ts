"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  contacts,
  companies,
  tags,
  pipelines,
  pipelineStages,
  deals,
} from "@/db/schema";
import { eq, and, sql, inArray, desc, asc } from "drizzle-orm";
import { requireActiveOrg, assertOrgAccess } from "@/lib/server/active-org";
import { deleteDealsForContacts } from "@/lib/server/pipeline-sync";
import { getOrgSettings } from "@/lib/server/org-settings";
import { sendPushToOrg } from "@/lib/server/push";
import {
  parseContactFieldDefs,
  parseContactFieldValues,
  type ContactFieldDef,
  type ContactFieldValue,
} from "@/lib/contact-fields";

export type ContactStatus =
  | "lead"
  | "qualified"
  | "in_conversation"
  | "meeting_booked"
  | "won"
  | "lost";

const VALID_STATUSES: ContactStatus[] = [
  "lead",
  "qualified",
  "in_conversation",
  "meeting_booked",
  "won",
  "lost",
];

function parseStatus(v: FormDataEntryValue | null): ContactStatus {
  const s = String(v ?? "lead");
  return (VALID_STATUSES as string[]).includes(s)
    ? (s as ContactStatus)
    : "lead";
}

function parseTags(v: FormDataEntryValue | null): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createContactAction(formData: FormData) {
  const org = await requireActiveOrg();

  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const companyName = String(formData.get("companyName") ?? "").trim();
  const status = parseStatus(formData.get("status"));
  const source = String(formData.get("source") ?? "").trim() || null;
  const tags = parseTags(formData.get("tags"));

  let companyId: string | null = null;
  if (companyName) {
    // Reuse vorhandene Firma mit gleichem Namen, sonst neu anlegen
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, org.id), eq(companies.name, companyName)))
      .limit(1);
    if (existing[0]) {
      companyId = existing[0].id;
    } else {
      const [c] = await db
        .insert(companies)
        .values({ orgId: org.id, name: companyName })
        .returning({ id: companies.id });
      companyId = c.id;
    }
  }

  const [inserted] = await db
    .insert(contacts)
    .values({
      orgId: org.id,
      companyId,
      firstName,
      lastName,
      email,
      phone,
      status,
      source,
      tags,
    })
    .returning({ id: contacts.id });

  // Push-Benachrichtigung „Neuer Lead" (best-effort, bricht nie ab).
  const leadName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    companyName ||
    email ||
    "Neuer Kontakt";
  await sendPushToOrg(org.id, {
    title: "Neuer Lead",
    body: companyName ? `${leadName} · ${companyName}` : leadName,
    url: `/crm/${inserted.id}`,
    tag: `lead-${inserted.id}`,
    event: "lead_neu",
  });

  revalidatePath("/crm");
  redirect(`/crm/${inserted.id}`);
}

export async function updateContactStatusAction(
  contactId: string,
  status: ContactStatus,
) {
  const org = await requireActiveOrg();
  await db
    .update(contacts)
    .set({ status })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath(`/crm/${contactId}`);
}

/**
 * Speichert den Wert EINES individuellen Feldes am Kontakt.
 * Werte leben in contacts.custom_fields unter dem Namespace "fields" —
 * atomarer jsonb-Merge, damit die Scraping-Namespaces (cells/enrichment/
 * instantly) unangetastet bleiben.
 */
export async function updateContactFieldValueAction(
  contactId: string,
  key: string,
  value: ContactFieldValue,
) {
  const org = await requireActiveOrg();
  const defs = parseContactFieldDefs(await getOrgSettings(org.id));
  const def = defs.find((d) => d.key === key);
  if (!def) throw new Error("Unbekanntes Feld.");

  let v: ContactFieldValue = null;
  switch (def.type) {
    case "checkbox":
      v = value === true;
      break;
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      v = Number.isFinite(n) && value !== null && value !== "" ? n : null;
      break;
    }
    case "select": {
      const s = typeof value === "string" ? value.trim() : "";
      v = s && (def.options ?? []).includes(s) ? s : null;
      break;
    }
    default: {
      // text | date | url | phone
      const s = typeof value === "string" ? value.trim() : String(value ?? "");
      v = s.slice(0, 500) || null;
    }
  }

  const patch = JSON.stringify({ [key]: v });
  await db
    .update(contacts)
    .set({
      customFields: sql`coalesce(${contacts.customFields}, '{}'::jsonb) || jsonb_build_object('fields', coalesce(${contacts.customFields} -> 'fields', '{}'::jsonb) || ${patch}::jsonb)`,
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));

  revalidatePath("/crm");
  revalidatePath(`/crm/${contactId}`);
}

export async function updateContactTagsAction(
  contactId: string,
  tagNames: string[],
) {
  const org = await requireActiveOrg();
  // Nur Namen zulassen, die verwaltet sind ODER bereits auf dem Kontakt
  // stehen — ein veralteter Client-Snapshot (zweiter Tab) kann so keine
  // umbenannten/gelöschten Tags wiederbeleben.
  const [orgTags, [current]] = await Promise.all([
    db.select({ name: tags.name }).from(tags).where(eq(tags.orgId, org.id)),
    db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)))
      .limit(1),
  ]);
  if (!current) throw new Error("Kontakt nicht gefunden.");
  const allowed = new Set([...orgTags.map((t) => t.name), ...current.tags]);
  const clean = [
    ...new Set(tagNames.map((t) => t.trim()).filter(Boolean)),
  ]
    .filter((t) => allowed.has(t))
    .slice(0, 50);
  await db
    .update(contacts)
    .set({ tags: clean })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath(`/crm/${contactId}`);
}

export async function deleteContactAction(contactId: string) {
  const org = await requireActiveOrg();
  // Ordner ↔ Pipeline: zugehörige Deals in verbundenen Pipelines mitlöschen.
  await deleteDealsForContacts(org.id, [contactId]);
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/crm");
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/pipelines");
  redirect("/crm");
}

// ============================================================================
// KONTAKT-SCHNELLANSICHT (Einschiebe-Panel in Kontakte & Pipelines)
// ============================================================================

/** Alle Daten, die das Kontakt-Panel zum Anzeigen & Bearbeiten braucht. */
export type ContactDrawerDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: ContactStatus;
  companyName: string | null;
  tags: string[];
  fieldDefs: ContactFieldDef[];
  fieldValues: Record<string, ContactFieldValue>;
  orgTags: { name: string; color: string | null }[];
  deals: {
    id: string;
    title: string;
    valueEur: number | null;
    pipelineId: string;
    pipelineName: string;
    stageName: string;
    stageColor: string | null;
  }[];
};

/**
 * Lädt einen Kontakt inkl. individueller Felder, Tags und Deals für das
 * Einschiebe-Panel. Bewusst schlank gehalten (keine Notizen/Aktivitäten/
 * Mail-Historie) — die stehen weiterhin auf der vollständigen Detailseite.
 */
export async function getContactDetailAction(
  contactId: string,
): Promise<ContactDrawerDetail> {
  const org = await requireActiveOrg();

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      source: contacts.source,
      status: contacts.status,
      tags: contacts.tags,
      customFields: contacts.customFields,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)))
    .limit(1);

  if (!contact) throw new Error("Kontakt nicht gefunden.");

  const [orgSettings, orgTags, contactDeals] = await Promise.all([
    getOrgSettings(org.id),
    db
      .select({ name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.orgId, org.id))
      .orderBy(asc(tags.name)),
    db
      .select({
        id: deals.id,
        title: deals.title,
        valueEur: deals.valueEur,
        pipelineId: deals.pipelineId,
        pipelineName: pipelines.name,
        stageName: pipelineStages.name,
        stageColor: pipelineStages.color,
      })
      .from(deals)
      .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.contactId, contactId), eq(deals.orgId, org.id)))
      .orderBy(desc(deals.createdAt)),
  ]);

  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    source: contact.source,
    status: contact.status,
    companyName: contact.companyName,
    tags: contact.tags,
    fieldDefs: parseContactFieldDefs(orgSettings),
    fieldValues: parseContactFieldValues(contact.customFields),
    orgTags,
    deals: contactDeals,
  };
}

/**
 * Speichert die Stammdaten eines Kontakts (Name, E-Mail, Telefon, Quelle,
 * Firma). Die Firma wird — wie beim Anlegen — anhand des Namens
 * wiederverwendet oder neu erstellt; ein leerer Name löst die Verknüpfung.
 */
export async function updateContactCoreAction(
  contactId: string,
  patch: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    companyName: string | null;
  },
): Promise<void> {
  const org = await requireActiveOrg();

  const norm = (v: string | null, max = 500): string | null => {
    const s = (v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  // Aktuellen Stand laden (auch für die Org-Prüfung).
  const [current] = await db
    .select({
      companyId: contacts.companyId,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)))
    .limit(1);
  if (!current) throw new Error("Kontakt nicht gefunden.");

  const desiredName = (patch.companyName ?? "").trim();
  let companyId: string | null;
  if (!desiredName) {
    // Firma bewusst entfernt → Verknüpfung lösen.
    companyId = null;
  } else if (
    current.companyName &&
    current.companyName.trim() === desiredName
  ) {
    // Name unverändert → bestehende Verknüpfung behalten. Wichtig: sonst würde
    // jede Bearbeitung eines anderen Feldes (z. B. Telefon) die Firma neu
    // auflösen und könnte bei gleichnamigen Firmen die falsche verknüpfen oder
    // eine neue anlegen.
    companyId = current.companyId;
  } else {
    // Name geändert → vorhandene Firma wiederverwenden oder neu anlegen.
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, org.id), eq(companies.name, desiredName)))
      .limit(1);
    if (existing[0]) {
      companyId = existing[0].id;
    } else {
      const [c] = await db
        .insert(companies)
        .values({ orgId: org.id, name: desiredName })
        .returning({ id: companies.id });
      companyId = c.id;
    }
  }

  await db
    .update(contacts)
    .set({
      firstName: norm(patch.firstName, 200),
      lastName: norm(patch.lastName, 200),
      email: norm(patch.email, 320),
      phone: norm(patch.phone, 100),
      source: norm(patch.source, 200),
      companyId,
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));

  revalidatePath("/crm");
  revalidatePath("/pipelines");
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath(`/crm/${contactId}`);
}

// ============================================================================
// SAMMEL-AKTIONEN (mehrere ausgewählte Kontakte auf einmal)
// ============================================================================

export type BulkResult = { ok: boolean; count: number };

/** IDs säubern: leere weg, deduplizieren, sinnvoll deckeln. */
function cleanIds(ids: string[]): string[] {
  return [
    ...new Set((ids ?? []).filter((s) => typeof s === "string" && s.trim())),
  ].slice(0, 2000);
}

/** Baut ein `array['a','b']::text[]`-Literal parametrisiert (kein SQL-Injection). */
function pgTextArray(items: string[]) {
  return sql`array[${sql.join(
    items.map((i) => sql`${i}`),
    sql`, `,
  )}]::text[]`;
}

/** Mehrere Kontakte löschen. */
export async function bulkDeleteContactsAction(
  ids: string[],
): Promise<BulkResult> {
  const org = await requireActiveOrg();
  const clean = cleanIds(ids);
  if (!clean.length) return { ok: true, count: 0 };
  // Ordner ↔ Pipeline: zugehörige Deals in verbundenen Pipelines mitlöschen.
  await deleteDealsForContacts(org.id, clean);
  await db
    .delete(contacts)
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, clean)));
  revalidatePath("/crm");
  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/pipelines");
  return { ok: true, count: clean.length };
}

/** Tags zu mehreren Kontakten hinzufügen (nur verwaltete Tags, dedupliziert). */
export async function bulkAddContactTagsAction(
  ids: string[],
  tagNames: string[],
): Promise<BulkResult> {
  const org = await requireActiveOrg();
  const clean = cleanIds(ids);
  const names = [
    ...new Set((tagNames ?? []).map((t) => t.trim()).filter(Boolean)),
  ];
  if (!clean.length || !names.length) return { ok: true, count: 0 };

  // Nur Tags zulassen, die in der Org verwaltet werden.
  const orgTags = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.orgId, org.id));
  const allowed = new Set(orgTags.map((t) => t.name));
  const toAdd = names.filter((n) => allowed.has(n)).slice(0, 50);
  if (!toAdd.length) return { ok: true, count: 0 };

  const arr = pgTextArray(toAdd);
  await db
    .update(contacts)
    .set({
      // vorhandene Tags mit den neuen vereinen und deduplizieren
      tags: sql`array(select distinct t from unnest(${contacts.tags} || ${arr}) as t)`,
    })
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, clean)));
  revalidatePath("/crm");
  return { ok: true, count: clean.length };
}

/** Tags von mehreren Kontakten entfernen. */
export async function bulkRemoveContactTagsAction(
  ids: string[],
  tagNames: string[],
): Promise<BulkResult> {
  const org = await requireActiveOrg();
  const clean = cleanIds(ids);
  const names = [
    ...new Set((tagNames ?? []).map((t) => t.trim()).filter(Boolean)),
  ].slice(0, 50);
  if (!clean.length || !names.length) return { ok: true, count: 0 };

  const arr = pgTextArray(names);
  await db
    .update(contacts)
    .set({
      tags: sql`array(select t from unnest(${contacts.tags}) as t where t <> all(${arr}))`,
    })
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, clean)));
  revalidatePath("/crm");
  return { ok: true, count: clean.length };
}

// ============================================================================
// IMPORT (CSV → Kontakte)
// ============================================================================

export type ImportContactInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  status?: string;
  source?: string;
  tags?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
};

/** Deutsche/englische Status-Bezeichnungen und Enum-Keys → Enum. */
const STATUS_FROM_TEXT: Record<string, ContactStatus> = {
  lead: "lead",
  "neuer lead": "lead",
  qualifiziert: "qualified",
  qualified: "qualified",
  "im gespräch": "in_conversation",
  "im gespraech": "in_conversation",
  in_conversation: "in_conversation",
  "termin gebucht": "meeting_booked",
  meeting_booked: "meeting_booked",
  "closed won": "won",
  gewonnen: "won",
  won: "won",
  "closed lost": "lost",
  verloren: "lost",
  lost: "lost",
};

function statusFromText(v: string | undefined): ContactStatus {
  const s = (v ?? "").trim().toLowerCase();
  return STATUS_FROM_TEXT[s] ?? "lead";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Legt mehrere Kontakte aus einer CSV/Tabelle an. Firmen werden anhand des
 * Namens wiederverwendet oder neu erstellt. Es werden bewusst KEINE
 * Push-Benachrichtigungen ausgelöst (sonst Spam bei Massenimport).
 */
export async function importContactsAction(
  input: ImportContactInput[],
): Promise<ImportResult> {
  const org = await requireActiveOrg();
  const total = Array.isArray(input) ? input.length : 0;
  if (!total) return { imported: 0, skipped: 0, total: 0 };

  const norm = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s ? s : null;
  };

  // Nur Zeilen mit mindestens einem sinnvollen Feld übernehmen.
  const rows = input
    .slice(0, 5000)
    .map((r) => ({
      firstName: norm(r.firstName),
      lastName: norm(r.lastName),
      email: norm(r.email),
      phone: norm(r.phone),
      companyName: norm(r.companyName),
      status: statusFromText(r.status),
      source: norm(r.source),
      tags: parseTags(r.tags ?? null),
    }))
    .filter(
      (r) =>
        r.firstName || r.lastName || r.email || r.phone || r.companyName,
    );

  const skipped = Math.min(total, 5000) - rows.length;
  if (!rows.length) return { imported: 0, skipped, total };

  // Firmen einmalig auflösen (vorhandene wiederverwenden, fehlende anlegen).
  const names = [...new Set(rows.map((r) => r.companyName).filter(Boolean))] as string[];
  const companyByName = new Map<string, string>();
  if (names.length) {
    const existing = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.orgId, org.id), inArray(companies.name, names)));
    existing.forEach((c) => companyByName.set(c.name, c.id));

    const toCreate = names.filter((n) => !companyByName.has(n));
    for (const nameChunk of chunk(toCreate, 500)) {
      const created = await db
        .insert(companies)
        .values(nameChunk.map((name) => ({ orgId: org.id, name })))
        .returning({ id: companies.id, name: companies.name });
      created.forEach((c) => companyByName.set(c.name, c.id));
    }
  }

  const values = rows.map((r) => ({
    orgId: org.id,
    companyId: r.companyName ? companyByName.get(r.companyName) ?? null : null,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    status: r.status,
    source: r.source,
    tags: r.tags,
  }));

  for (const part of chunk(values, 500)) {
    await db.insert(contacts).values(part);
  }

  revalidatePath("/crm");
  return { imported: values.length, skipped, total };
}

export { assertOrgAccess };
