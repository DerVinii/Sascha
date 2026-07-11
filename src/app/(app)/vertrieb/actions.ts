"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contacts, companies, leadLists } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  onContactsAddedToList,
  deleteDealsForContacts,
} from "@/lib/server/pipeline-sync";
import { deleteLeadsByEmails } from "@/lib/server/instantly/client";

export type ImportRow = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  source?: string | null;
};

export type ImportResult = {
  imported: number;
  duplicates: number;
  errors: string[];
};

/**
 * Massen-Import von Leads. Status wird auf 'lead' gesetzt. Duplikate werden
 * anhand der E-Mail-Adresse erkannt (innerhalb der gleichen Org).
 */
export async function importLeadsAction(
  rows: ImportRow[],
  listId?: string,
): Promise<ImportResult> {
  const org = await requireActiveOrg();
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

  if (rows.length === 0) return result;

  // Existing emails in this org für Dubletten-Check
  const existingEmails = new Set(
    (
      await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(eq(contacts.orgId, org.id))
    )
      .map((r) => r.email?.toLowerCase())
      .filter(Boolean) as string[],
  );

  // Firmen-Map aufbauen für deduplizierte company_id-Vergabe
  const uniqueCompanyNames = [
    ...new Set(
      rows
        .map((r) => r.companyName?.trim())
        .filter((c): c is string => Boolean(c)),
    ),
  ];

  const companyMap = new Map<string, string>();
  if (uniqueCompanyNames.length > 0) {
    const existingCompanies = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(
        and(
          eq(companies.orgId, org.id),
          inArray(companies.name, uniqueCompanyNames),
        ),
      );
    for (const c of existingCompanies) companyMap.set(c.name, c.id);

    const missing = uniqueCompanyNames.filter((n) => !companyMap.has(n));
    if (missing.length > 0) {
      const newCompanies = await db
        .insert(companies)
        .values(
          missing.map((name) => ({
            orgId: org.id,
            leadListId: listId ?? null,
            name,
          })),
        )
        .returning({ id: companies.id, name: companies.name });
      for (const c of newCompanies) companyMap.set(c.name, c.id);
    }
  }

  // Insertion-Batch
  const toInsert: Array<typeof contacts.$inferInsert> = [];
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase() || null;
    if (email && existingEmails.has(email)) {
      result.duplicates += 1;
      continue;
    }
    if (email) existingEmails.add(email);

    toInsert.push({
      orgId: org.id,
      leadListId: listId ?? null,
      firstName: row.firstName?.trim() || null,
      lastName: row.lastName?.trim() || null,
      email,
      phone: row.phone?.trim() || null,
      status: "lead",
      source: row.source?.trim() || "CSV-Import",
      companyId: row.companyName?.trim()
        ? companyMap.get(row.companyName.trim()) ?? null
        : null,
    });
  }

  if (toInsert.length > 0) {
    const inserted = await db
      .insert(contacts)
      .values(toInsert)
      .returning({ id: contacts.id });
    result.imported = inserted.length;
    // Ordner ↔ Pipeline: neue Leads als Deals spiegeln (falls verbunden).
    await onContactsAddedToList(
      org.id,
      listId,
      inserted.map((r) => r.id),
    );
  }

  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  return result;
}

export async function qualifyLeadAction(contactId: string) {
  const org = await requireActiveOrg();
  await db
    .update(contacts)
    .set({ status: "qualified" })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/vertrieb");
  revalidatePath("/crm");
}

export async function deleteLeadAction(contactId: string) {
  const org = await requireActiveOrg();
  // Nur löschen, wenn der Kontakt wirklich noch ein 'lead' ist — und dann Deal
  // + Kontakt im Gleichschritt entfernen. (Deal ZUERST: beim Kontakt-Löschen
  // würde deals.contactId auf NULL gesetzt und ließe sich nicht mehr zuordnen.)
  const [c] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      leadListId: contacts.leadListId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.orgId, org.id),
        eq(contacts.status, "lead"),
      ),
    )
    .limit(1);
  if (!c) return;

  // Gehört der Lead zu einem Ordner mit Instantly-Kampagne? Dann auch dort löschen
  // (Best-Effort, vor dem lokalen Löschen). Fehler blockieren das Löschen nicht.
  const email = (c.email ?? "").trim();
  if (c.leadListId && email.includes("@")) {
    const [list] = await db
      .select({ instantlyCampaignId: leadLists.instantlyCampaignId })
      .from(leadLists)
      .where(and(eq(leadLists.id, c.leadListId), eq(leadLists.orgId, org.id)))
      .limit(1);
    if (list?.instantlyCampaignId) {
      try {
        await deleteLeadsByEmails([email]);
      } catch (err) {
        console.error("Instantly: Lead konnte nicht gelöscht werden:", err);
      }
    }
  }

  await deleteDealsForContacts(org.id, [contactId]);
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));

  revalidatePath("/vertrieb");
  revalidatePath("/vertrieb/scraping");
  revalidatePath("/crm");
  revalidatePath("/pipelines");
}
