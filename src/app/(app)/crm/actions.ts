"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireActiveOrg, assertOrgAccess } from "@/lib/server/active-org";

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

export async function deleteContactAction(contactId: string) {
  const org = await requireActiveOrg();
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)));
  revalidatePath("/crm");
  redirect("/crm");
}

export { assertOrgAccess };
