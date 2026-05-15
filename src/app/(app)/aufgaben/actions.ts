"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/server/active-org";

export type ActivityType =
  | "task"
  | "call"
  | "meeting"
  | "follow_up"
  | "note";

const VALID_TYPES: ActivityType[] = [
  "task",
  "call",
  "meeting",
  "follow_up",
  "note",
];

function parseType(v: FormDataEntryValue | null): ActivityType {
  const s = String(v ?? "task");
  return (VALID_TYPES as string[]).includes(s)
    ? (s as ActivityType)
    : "task";
}

export async function createActivityAction(formData: FormData) {
  const org = await requireActiveOrg();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Titel darf nicht leer sein");

  const body = String(formData.get("body") ?? "").trim() || null;
  const type = parseType(formData.get("type"));
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const contactIdRaw = String(formData.get("contactId") ?? "").trim();

  await db.insert(activities).values({
    orgId: org.id,
    type,
    title,
    body,
    dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
    contactId: contactIdRaw || null,
    assigneeId: user?.id,
  });

  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
  if (contactIdRaw) revalidatePath(`/crm/${contactIdRaw}`);
}

export async function toggleActivityAction(activityId: string) {
  const org = await requireActiveOrg();

  const [current] = await db
    .select({ completedAt: activities.completedAt, contactId: activities.contactId })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.orgId, org.id)))
    .limit(1);

  if (!current) return;

  await db
    .update(activities)
    .set({ completedAt: current.completedAt ? null : new Date() })
    .where(and(eq(activities.id, activityId), eq(activities.orgId, org.id)));

  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
  if (current.contactId) revalidatePath(`/crm/${current.contactId}`);
}

export async function deleteActivityAction(activityId: string) {
  const org = await requireActiveOrg();
  await db
    .delete(activities)
    .where(and(eq(activities.id, activityId), eq(activities.orgId, org.id)));
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
}
