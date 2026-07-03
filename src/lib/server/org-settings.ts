import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * organizations.settings (JSONB) hält mehrere unabhängige Namespaces
 * (leadViews aus dem Vertrieb, contactFields aus den Einstellungen, …).
 * Schreibzugriffe laufen deshalb IMMER als atomarer jsonb-||-Merge auf
 * Top-Level-Key-Ebene — nie als Vollüberschreiben des Objekts.
 */

export async function getOrgSettings(
  orgId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return (row?.settings ?? {}) as Record<string, unknown>;
}

/** Setzt einen Top-Level-Key in settings; alle anderen Keys bleiben DB-seitig erhalten. */
export async function setOrgSettingsKey(
  orgId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const patch = JSON.stringify({ [key]: value });
  await db
    .update(organizations)
    .set({
      settings: sql`coalesce(${organizations.settings}, '{}'::jsonb) || ${patch}::jsonb`,
    })
    .where(eq(organizations.id, orgId));
}
