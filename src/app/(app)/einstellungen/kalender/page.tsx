import { requireActiveOrg } from "@/lib/server/active-org";
import { getGoogleAccount } from "@/lib/server/google/oauth";
import { googleConfigured } from "@/lib/server/google/config";
import { GoogleConnectionCard } from "../_components/google-connection-card";

export const dynamic = "force-dynamic";

export default async function KalenderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ verbunden?: string; fehler?: string }>;
}) {
  const org = await requireActiveOrg();
  const [account, sp] = await Promise.all([
    getGoogleAccount(org.id),
    searchParams,
  ]);

  return (
    <GoogleConnectionCard
      configured={googleConfigured()}
      connected={Boolean(account)}
      email={account?.email ?? null}
      lastSyncedAt={account?.lastSyncedAt ? account.lastSyncedAt.toISOString() : null}
      lastError={account?.lastError ?? null}
      flashConnected={sp.verbunden === "1"}
      flashError={sp.fehler ?? null}
    />
  );
}
