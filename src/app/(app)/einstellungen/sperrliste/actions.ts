"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  addBlockedLead,
  listBlockedLeads,
  removeBlockedLead,
  type BlockedLead,
} from "@/lib/server/blocklist";

export async function listBlockedLeadsAction(): Promise<BlockedLead[]> {
  const org = await requireActiveOrg();
  return listBlockedLeads(org.id);
}

export async function addBlockedLeadAction(input: {
  email?: string | null;
  name?: string | null;
  note?: string | null;
}): Promise<{ entries: BlockedLead[]; error: string | null }> {
  const org = await requireActiveOrg();
  const { error } = await addBlockedLead(org.id, input);
  if (error) return { entries: await listBlockedLeads(org.id), error };
  revalidatePath("/einstellungen/sperrliste");
  return { entries: await listBlockedLeads(org.id), error: null };
}

export async function removeBlockedLeadAction(input: {
  id: string;
}): Promise<BlockedLead[]> {
  const org = await requireActiveOrg();
  await removeBlockedLead(org.id, input.id);
  revalidatePath("/einstellungen/sperrliste");
  return listBlockedLeads(org.id);
}
