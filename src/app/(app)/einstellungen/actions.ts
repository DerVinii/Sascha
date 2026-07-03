"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { contacts, tags } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { getOrgSettings, setOrgSettingsKey } from "@/lib/server/org-settings";
import {
  parseContactFieldDefs,
  slugifyFieldKey,
  type ContactFieldDef,
  type ContactFieldType,
  CONTACT_FIELD_TYPES,
} from "@/lib/contact-fields";

// ============================================================================
// Kontaktfelder (Custom-Field-Definitionen)
// ============================================================================

const VALID_FIELD_TYPES = new Set<string>(
  CONTACT_FIELD_TYPES.map((t) => t.value),
);

async function loadDefs(orgId: string): Promise<ContactFieldDef[]> {
  return parseContactFieldDefs(await getOrgSettings(orgId));
}

async function saveDefs(orgId: string, defs: ContactFieldDef[]) {
  await setOrgSettingsKey(orgId, "contactFields", defs);
  revalidatePath("/einstellungen/kontaktfelder");
  revalidatePath("/crm");
}

function cleanOptions(options: string[] | undefined): string[] {
  return [
    ...new Set((options ?? []).map((o) => o.trim()).filter(Boolean)),
  ].slice(0, 50);
}

export async function addContactFieldAction(input: {
  label: string;
  type: ContactFieldType;
  options?: string[];
  showInTable: boolean;
}) {
  const org = await requireActiveOrg();
  const label = input.label.trim();
  if (!label) throw new Error("Bitte einen Feldnamen angeben.");
  if (!VALID_FIELD_TYPES.has(input.type)) {
    throw new Error("Unbekannter Feldtyp.");
  }
  const defs = await loadDefs(org.id);
  if (defs.length >= 30) {
    throw new Error("Maximal 30 individuelle Felder möglich.");
  }
  const key = slugifyFieldKey(
    label,
    defs.map((d) => d.key),
  );
  const def: ContactFieldDef = {
    key,
    label,
    type: input.type,
    showInTable: input.showInTable === true,
  };
  if (input.type === "select") {
    const options = cleanOptions(input.options);
    if (options.length === 0) {
      throw new Error("Ein Auswahl-Feld braucht mindestens eine Option.");
    }
    def.options = options;
  }
  await saveDefs(org.id, [...defs, def]);
}

export async function updateContactFieldAction(
  key: string,
  patch: { label?: string; options?: string[]; showInTable?: boolean },
) {
  const org = await requireActiveOrg();
  const defs = await loadDefs(org.id);
  const idx = defs.findIndex((d) => d.key === key);
  if (idx === -1) throw new Error("Feld nicht gefunden.");
  const def = { ...defs[idx] };
  if (patch.label !== undefined) {
    def.label = patch.label.trim() || def.label;
  }
  if (patch.showInTable !== undefined) {
    def.showInTable = patch.showInTable === true;
  }
  if (patch.options !== undefined && def.type === "select") {
    const options = cleanOptions(patch.options);
    if (options.length === 0) {
      throw new Error("Ein Auswahl-Feld braucht mindestens eine Option.");
    }
    def.options = options;
  }
  const next = [...defs];
  next[idx] = def;
  await saveDefs(org.id, next);
}

export async function moveContactFieldAction(key: string, dir: "up" | "down") {
  const org = await requireActiveOrg();
  const defs = await loadDefs(org.id);
  const idx = defs.findIndex((d) => d.key === key);
  if (idx === -1) return;
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= defs.length) return;
  const next = [...defs];
  [next[idx], next[swap]] = [next[swap], next[idx]];
  await saveDefs(org.id, next);
}

export async function deleteContactFieldAction(key: string) {
  const org = await requireActiveOrg();
  const defs = await loadDefs(org.id);
  await saveDefs(
    org.id,
    defs.filter((d) => d.key !== key),
  );
}

// ============================================================================
// Tags
// ============================================================================

async function orgTag(tagId: string, orgId: string) {
  const [row] = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

async function tagNameExists(
  orgId: string,
  name: string,
  exceptTagId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.orgId, orgId));
  const lower = name.toLowerCase();
  return rows.some(
    (r) => r.id !== exceptTagId && r.name.toLowerCase() === lower,
  );
}

/** array_replace + Dedupe (Reihenfolge nicht signifikant) für contacts.tags. */
function replacedDedupedTags(oldName: string, newName: string) {
  return sql`(SELECT coalesce(array_agg(DISTINCT t), '{}'::text[]) FROM unnest(array_replace(${contacts.tags}, ${oldName}::text, ${newName}::text)) AS u(t))`;
}

function revalidateTagViews() {
  revalidatePath("/einstellungen/tags");
  revalidatePath("/crm");
}

export async function createTagAction(name: string, color: string) {
  const org = await requireActiveOrg();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Bitte einen Tag-Namen angeben.");
  if (await tagNameExists(org.id, trimmed)) {
    throw new Error(`Tag "${trimmed}" existiert bereits.`);
  }
  await db.insert(tags).values({
    orgId: org.id,
    name: trimmed,
    color: color || null,
    scope: "contact",
  });
  revalidateTagViews();
}

export async function renameTagAction(tagId: string, name: string) {
  const org = await requireActiveOrg();
  const tag = await orgTag(tagId, org.id);
  if (!tag) throw new Error("Tag nicht gefunden.");
  const trimmed = name.trim();
  if (!trimmed || trimmed === tag.name) return;
  // exceptTagId: reine Groß-/Kleinschreibungs-Korrekturen zulassen.
  if (await tagNameExists(org.id, trimmed, tagId)) {
    throw new Error(`Tag "${trimmed}" existiert bereits.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(tags)
      .set({ name: trimmed })
      .where(and(eq(tags.id, tagId), eq(tags.orgId, org.id)));
    // Tag-Namen stehen denormalisiert in contacts.tags (text[]). Dedupe,
    // falls der neue Name dort bereits (unverwaltet) vorkommt.
    await tx
      .update(contacts)
      .set({ tags: replacedDedupedTags(tag.name, trimmed) })
      .where(
        and(
          eq(contacts.orgId, org.id),
          sql`${tag.name}::text = ANY(${contacts.tags})`,
        ),
      );
  });
  revalidateTagViews();
}

/**
 * Übernimmt einen auf Kontakten gefundenen, unverwalteten Tag in die
 * Verwaltung. Existiert bereits ein Tag mit anderer Groß-/Kleinschreibung,
 * werden die Kontakte auf die verwaltete Schreibweise migriert.
 */
export async function adoptUnmanagedTagAction(name: string, color: string) {
  const org = await requireActiveOrg();
  const trimmed = name.trim();
  if (!trimmed) return;
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.orgId, org.id));
  const existing = rows.find(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (!existing) {
    await db.insert(tags).values({
      orgId: org.id,
      name: trimmed,
      color: color || null,
      scope: "contact",
    });
  } else if (existing.name !== trimmed) {
    // Case-Variante: Kontakte auf die verwaltete Schreibweise umziehen.
    await db
      .update(contacts)
      .set({ tags: replacedDedupedTags(trimmed, existing.name) })
      .where(
        and(
          eq(contacts.orgId, org.id),
          sql`${trimmed}::text = ANY(${contacts.tags})`,
        ),
      );
  }
  revalidateTagViews();
}

export async function updateTagColorAction(tagId: string, color: string) {
  const org = await requireActiveOrg();
  await db
    .update(tags)
    .set({ color: color || null })
    .where(and(eq(tags.id, tagId), eq(tags.orgId, org.id)));
  revalidateTagViews();
}

export async function deleteTagAction(tagId: string) {
  const org = await requireActiveOrg();
  const tag = await orgTag(tagId, org.id);
  if (!tag) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.orgId, org.id)));
    await tx
      .update(contacts)
      .set({
        tags: sql`array_remove(${contacts.tags}, ${tag.name}::text)`,
      })
      .where(
        and(
          eq(contacts.orgId, org.id),
          sql`${tag.name}::text = ANY(${contacts.tags})`,
        ),
      );
  });
  revalidateTagViews();
}

/** Für die Tag-Verwaltung: alle Tags der Org inkl. Nutzungszähler. */
export async function listOrgTags() {
  const org = await requireActiveOrg();
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.orgId, org.id))
    .orderBy(asc(tags.name));
  return rows;
}

// ============================================================================
// Darstellung (Theme)
// ============================================================================

export type Theme = "light" | "dark" | "system";

export async function setThemeAction(theme: Theme) {
  const value: Theme = ["light", "dark", "system"].includes(theme)
    ? theme
    : "light";
  const store = await cookies();
  store.set("sk_theme", value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
