"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notes, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/server/active-org";

export async function addNoteAction(contactId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;

  const org = await requireActiveOrg();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify contact belongs to this org
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, org.id)))
    .limit(1);

  if (!contact) throw new Error("Contact not found");

  await db.insert(notes).values({
    orgId: org.id,
    contactId,
    body: trimmed,
    authorId: user?.id,
  });

  revalidatePath(`/crm/${contactId}`);
}
