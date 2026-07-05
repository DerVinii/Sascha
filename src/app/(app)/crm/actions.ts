"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, companies, tags } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireActiveOrg, assertOrgAccess } from "@/lib/server/active-org";
import { getOrgSettings } from "@/lib/server/org-settings";
import { sendPushToOrg } from "@/lib/server/push";
import {
  parseContactFieldDefs,
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
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/crm");
  redirect("/crm");
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
  await db
    .delete(contacts)
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, clean)));
  revalidatePath("/crm");
  return { ok: true, count: clean.length };
}

/** Status ("Phase") mehrerer Kontakte setzen — das „Verschieben". */
export async function bulkUpdateContactStatusAction(
  ids: string[],
  status: ContactStatus,
): Promise<BulkResult> {
  const org = await requireActiveOrg();
  const clean = cleanIds(ids);
  if (!clean.length) return { ok: true, count: 0 };
  if (!(VALID_STATUSES as string[]).includes(status)) {
    throw new Error("Ungültiger Status.");
  }
  await db
    .update(contacts)
    .set({ status })
    .where(and(eq(contacts.orgId, org.id), inArray(contacts.id, clean)));
  revalidatePath("/crm");
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

export { assertOrgAccess };
