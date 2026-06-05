import { db } from "@/db";
import { organizations } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export type ActiveOrg = {
  id: string;
  name: string;
  role: "owner" | "admin" | "sales" | "instructor" | "viewer";
};

/**
 * Liefert die aktive Organisation.
 *
 * Die Anmeldung wurde entfernt — es gibt keinen User-Kontext mehr.
 * Standard: die erste (älteste) Organisation in der Datenbank.
 * Optional über die Env-Var `ACTIVE_ORG_ID` fest auswählbar.
 */
export async function getActiveOrg(): Promise<ActiveOrg | null> {
  const fixedId = process.env.ACTIVE_ORG_ID;

  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(fixedId ? eq(organizations.id, fixedId) : undefined)
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  const org = rows[0];
  if (!org) return null;

  // Ohne Auth gibt es keine Rollen-Differenzierung — voller Zugriff.
  return { id: org.id, name: org.name, role: "owner" };
}

/**
 * Variante, die wirft, wenn keine Org existiert — für Routes, die zwingend
 * einen Org-Kontext brauchen.
 */
export async function requireActiveOrg(): Promise<ActiveOrg> {
  const org = await getActiveOrg();
  if (!org) {
    throw new Error(
      "Keine Organisation in der Datenbank gefunden. Bitte zuerst `npm run seed` ausführen.",
    );
  }
  return org;
}

/**
 * Früher: Prüfung, ob der eingeloggte User Mitglied der Org ist.
 * Ohne Anmeldung entfällt diese Prüfung — bleibt als kompatible Signatur
 * erhalten, damit bestehende Aufrufer unverändert weiterlaufen.
 */
export async function assertOrgAccess(_orgId: string): Promise<ActiveOrg> {
  return requireActiveOrg();
}
