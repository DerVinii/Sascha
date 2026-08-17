import { requireActiveOrg } from "@/lib/server/active-org";
import { listBlockedLeads } from "@/lib/server/blocklist";
import { BlocklistManager } from "./_components/blocklist-manager";

export const dynamic = "force-dynamic";

export default async function SperrlistePage() {
  const org = await requireActiveOrg();
  const entries = await listBlockedLeads(org.id);
  return <BlocklistManager initial={entries} />;
}
