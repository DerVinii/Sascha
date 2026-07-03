"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db";
import { organizations, contacts, tags } from "@/db/schema";
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
import { getUnreadCount } from "@/lib/server/instantly/client";
import { ZUGANG_COOKIE } from "@/lib/zugang-token";

// ============================================================================
// Organisation
// ============================================================================

export async function updateOrgNameAction(name: string) {
  const org = await requireActiveOrg();
  const trimmed = name.trim();
  if (!trimmed) return;
  await db
    .update(organizations)
    .set({ name: trimmed })
    .where(eq(organizations.id, org.id));
  // Der Org-Name steht in der Sidebar — gesamtes Layout revalidieren.
  revalidatePath("/", "layout");
}

// ============================================================================
// Integrationen — Verbindungstests
// ============================================================================

export type IntegrationTestResult = { ok: boolean; message: string };

/**
 * Bewusst Result-Objekt statt throw: Next.js maskiert geworfene
 * Server-Action-Fehler im Production-Build (generische Meldung).
 */
export async function testIntegrationAction(
  service: "instantly" | "places" | "gemini",
): Promise<IntegrationTestResult> {
  try {
    switch (service) {
      case "instantly": {
        if (!process.env.INSTANTLY_API_KEY?.trim()) {
          return {
            ok: false,
            message: "Kein API-Key hinterlegt (INSTANTLY_API_KEY).",
          };
        }
        const unread = await getUnreadCount();
        return {
          ok: true,
          message: `Verbunden — ${unread} ungelesene Antwort(en) in der Unibox.`,
        };
      }
      case "places": {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
        if (!apiKey) {
          return {
            ok: false,
            message: "Kein API-Key hinterlegt (GOOGLE_PLACES_API_KEY).",
          };
        }
        // Billigste Abfrage: nur places.id als FieldMask (ID-only-SKU).
        const res = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "places.id",
            },
            body: JSON.stringify({
              textQuery: "Bäckerei Berlin",
              languageCode: "de",
              regionCode: "DE",
            }),
            cache: "no-store",
          },
        );
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 200);
          return { ok: false, message: `Fehler ${res.status}: ${detail}` };
        }
        return { ok: true, message: "Verbunden — Test-Suche erfolgreich." };
      }
      case "gemini": {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
          return {
            ok: false,
            message: "Kein API-Key hinterlegt (GEMINI_API_KEY).",
          };
        }
        // ListModels ist kostenlos und validiert den Key.
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 200);
          return { ok: false, message: `Fehler ${res.status}: ${detail}` };
        }
        const data = (await res.json()) as { models?: unknown[] };
        const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
        return {
          ok: true,
          message: `Verbunden — ${data.models?.length ?? 0} Modelle verfügbar (genutzt: ${model}).`,
        };
      }
    }
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message.slice(0, 200) : "Unbekannter Fehler.",
    };
  }
}

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

async function tagNameExists(orgId: string, name: string): Promise<boolean> {
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.orgId, orgId));
  const lower = name.toLowerCase();
  return rows.some((r) => r.name.toLowerCase() === lower);
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
  if (await tagNameExists(org.id, trimmed)) {
    throw new Error(`Tag "${trimmed}" existiert bereits.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(tags)
      .set({ name: trimmed })
      .where(and(eq(tags.id, tagId), eq(tags.orgId, org.id)));
    // Tag-Namen stehen denormalisiert in contacts.tags (text[]).
    await tx
      .update(contacts)
      .set({
        tags: sql`array_replace(${contacts.tags}, ${tag.name}::text, ${trimmed}::text)`,
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

// ============================================================================
// Sicherheit (Zugriffsschutz)
// ============================================================================

export async function logoutAction() {
  const store = await cookies();
  store.delete(ZUGANG_COOKIE);
  redirect("/zugang");
}
