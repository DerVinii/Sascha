import { requireActiveOrg } from "@/lib/server/active-org";
import {
  getAccountDailyAnalytics,
  getWarmupAnalytics,
  listAccountsFull,
  type AccountDailyStat,
  type InstantlyAccountFull,
  type WarmupAggregate,
  type WarmupDay,
} from "@/lib/server/instantly/client";
import type { AccountRow } from "@/lib/instantly-ui";
import { AccountsDashboard } from "./_components/accounts-dashboard";

export const dynamic = "force-dynamic";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Heutiges Datum in Berliner Zeit. Über toISOString() (UTC) läge „heute" in den
 * frühen Morgenstunden noch auf dem Vortag — die Tageszahl wäre dann falsch.
 */
function berlinToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
}

export default async function AccountsPage() {
  await requireActiveOrg();

  let error: string | null = null;
  let accounts: InstantlyAccountFull[] = [];
  let warmup: {
    aggregate: Record<string, WarmupAggregate>;
    perDay: Record<string, Record<string, WarmupDay>>;
  } = { aggregate: {}, perDay: {} };
  let daily: AccountDailyStat[] = [];

  try {
    accounts = await listAccountsFull();
    warmup = await getWarmupAnalytics(accounts.map((a) => a.email));
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Instantly-API nicht erreichbar";
  }

  // Fehlgeschlagene Statistik darf nicht als "0 gesendet" durchgehen — dann
  // stünde eine glatte Null da, wo in Wahrheit nichts abgefragt werden konnte.
  let statsError: string | null = null;

  if (!error) {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
      daily = await getAccountDailyAnalytics(
        isoDay(start),
        isoDay(end),
        accounts.map((a) => a.email),
      );
    } catch (err) {
      statsError =
        err instanceof Error ? err.message : "Statistik nicht abrufbar";
    }
  }

  const today = berlinToday();
  const sevenDaysAgo = isoDay(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  );

  const rows: AccountRow[] = accounts.map((a) => {
    const agg = warmup.aggregate[a.email];
    const days = warmup.perDay[a.email] ?? {};
    const last7 = Object.entries(days)
      .sort(([x], [y]) => x.localeCompare(y))
      .slice(-7)
      .map(([date, v]) => ({
        date,
        sent: v.sent,
        landedInbox: v.landedInbox,
        landedSpam: v.landedSpam,
      }));
    const mine = daily.filter((d) => d.email === a.email);
    const mine7 = mine.filter((d) => d.date >= sevenDaysAgo);
    const sum = (arr: AccountDailyStat[], f: (d: AccountDailyStat) => number) =>
      arr.reduce((s, d) => s + f(d), 0);
    return {
      email: a.email,
      name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
      status: a.status,
      statusMessage: a.statusMessage,
      warmupStatus: a.warmupStatus,
      healthScore: agg?.healthScore ?? a.warmupScore,
      dailyLimit: a.dailyLimit,
      providerCode: a.providerCode,
      warmupSent: agg?.sent ?? 0,
      warmupInbox: agg?.landedInbox ?? 0,
      warmupSpam: agg?.landedSpam ?? 0,
      sentToday: sum(
        mine.filter((d) => d.date === today),
        (d) => d.sent,
      ),
      sent7: sum(mine7, (d) => d.sent),
      replies7: sum(mine7, (d) => d.replies),
      bounced7: sum(mine7, (d) => d.bounced),
      sent30: sum(mine, (d) => d.sent),
      replies30: sum(mine, (d) => d.replies),
      bounced30: sum(mine, (d) => d.bounced),
      lastUsed: a.timestampLastUsed,
      last7,
    };
  });

  return (
    <AccountsDashboard
      accounts={rows}
      error={error}
      statsError={statsError}
    />
  );
}
