import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  getCampaignOverview,
  getCampaignAnalytics,
  getCampaignDailyAnalytics,
  listCampaigns,
} from "@/lib/server/instantly/client";
import {
  fmtDayLabelYear,
  type CampaignRow,
  type ContactStatusKey,
  type DailyPoint,
  type Range,
  type StatOverview,
  type StatusCounts,
} from "@/lib/statistik-ui";
import { StatistikDashboard } from "./_components/statistik-dashboard";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeRange(v: string | undefined): Range {
  return v === "7d" || v === "90d" || v === "all" ? v : "30d";
}

const EMPTY_OVERVIEW: StatOverview = {
  emailsSent: 0,
  contacted: 0,
  openUnique: 0,
  linkClickUnique: 0,
  replyUnique: 0,
  bounced: 0,
  unsubscribed: 0,
  opportunities: 0,
  opportunityValue: 0,
  interested: 0,
  meetingBooked: 0,
  meetingCompleted: 0,
  closed: 0,
};

/** Alle Tage von start..end (inkl.) als ISO-Liste. */
function eachDay(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return out;
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const org = await requireActiveOrg();

  const sp = await searchParams;
  const range = normalizeRange(sp?.range);

  // Trichter-Quelle: CRM-Kontaktstatus (org-weit) — nur so sind Interessiert /
  // Termine / Gewonnen trackbar. Läuft parallel zu den Instantly-Calls.
  const statusPromise = db
    .select({ status: contacts.status, count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.orgId, org.id))
    .groupBy(contacts.status);

  const today = new Date();
  const end = isoDay(today);
  const daysBack =
    range === "7d" ? 6 : range === "90d" ? 89 : range === "all" ? null : 29;

  // overview + per-campaign: bei „Gesamt" keine Datumsgrenzen (Lifetime).
  const startDate =
    daysBack == null ? undefined : isoDay(new Date(today.getTime() - daysBack * DAY_MS));
  // daily verlangt zwingend Grenzen. Bei „Gesamt" weit zurück ankern und
  // die dichte Achse anschließend auf die echten Daten (max. ~1 Jahr) kappen.
  const dailyStart = daysBack == null ? "2020-01-01" : startDate!;

  const [ovR, camR, dailyR, listR] = await Promise.allSettled([
    getCampaignOverview(startDate, end),
    getCampaignAnalytics(startDate, end),
    getCampaignDailyAnalytics(dailyStart, end),
    listCampaigns(),
  ]);

  // Die Overview ist der tragende Call — nur sie setzt den Fehlerzustand.
  let error: string | null = null;
  let rateLimited = false;
  let overview: StatOverview = EMPTY_OVERVIEW;
  if (ovR.status === "fulfilled") {
    overview = ovR.value;
  } else {
    const msg =
      ovR.reason instanceof Error
        ? ovR.reason.message
        : "Instantly-API nicht erreichbar";
    error = msg;
    rateLimited = /\b429\b/.test(msg);
  }

  const stats = camR.status === "fulfilled" ? camR.value : [];
  const list = listR.status === "fulfilled" ? listR.value : [];
  const dailyRaw = dailyR.status === "fulfilled" ? dailyR.value : [];

  // Kampagnen mergen: aus listCampaigns() (garantiert alle, inkl. Entwürfe),
  // Analytics-Zeilen überlagern, fehlende Werte auf 0.
  const byId = new Map(stats.map((s) => [s.campaignId, s]));
  const seen = new Set<string>();
  const campaigns: CampaignRow[] = [];
  for (const c of list) {
    const s = byId.get(c.id);
    seen.add(c.id);
    campaigns.push({
      id: c.id,
      name: c.name,
      status: s?.status ?? c.status,
      isEvergreen: s?.isEvergreen ?? false,
      contacted: s?.contacted ?? 0,
      emailsSent: s?.emailsSent ?? 0,
      openCount: s?.openCount ?? 0,
      replyCount: s?.replyCount ?? 0,
      bounced: s?.bounced ?? 0,
      opportunities: s?.opportunities ?? 0,
      opportunityValue: s?.opportunityValue ?? 0,
    });
  }
  // Analytics-Zeilen ohne passende Kampagne in der Liste (Sicherheitsnetz).
  for (const s of stats) {
    if (seen.has(s.campaignId)) continue;
    campaigns.push({
      id: s.campaignId,
      name: s.campaignName,
      status: s.status,
      isEvergreen: s.isEvergreen,
      contacted: s.contacted,
      emailsSent: s.emailsSent,
      openCount: s.openCount,
      replyCount: s.replyCount,
      bounced: s.bounced,
      opportunities: s.opportunities,
      opportunityValue: s.opportunityValue,
    });
  }

  // Dichte Tagesreihe. Bei „Gesamt" auf den frühesten echten Tag (max. 365 T
  // zurück) beschränken, damit die Payload nicht explodiert.
  let denseStart = dailyStart;
  if (range === "all") {
    const cap = isoDay(new Date(today.getTime() - 364 * DAY_MS));
    const earliest = dailyRaw.length
      ? dailyRaw[0].date
      : isoDay(new Date(today.getTime() - 89 * DAY_MS));
    denseStart = earliest < cap ? cap : earliest;
  }
  const byDate = new Map(dailyRaw.map((r) => [r.date, r]));
  const daily: DailyPoint[] = eachDay(denseStart, end).map((date) => {
    const r = byDate.get(date);
    return {
      date,
      sent: r?.sent ?? 0,
      opened: r?.opened ?? 0,
      uniqueOpened: r?.uniqueOpened ?? 0,
      replies: r?.replies ?? 0,
      uniqueReplies: r?.uniqueReplies ?? 0,
      clicks: r?.clicks ?? 0,
      uniqueClicks: r?.uniqueClicks ?? 0,
    };
  });

  const rangeLabel =
    range === "all"
      ? "gesamter Zeitraum"
      : `${fmtDayLabelYear(startDate!)} – ${fmtDayLabelYear(end)}`;

  const statusCounts: StatusCounts = {
    lead: 0,
    qualified: 0,
    in_conversation: 0,
    meeting_booked: 0,
    won: 0,
    lost: 0,
  };
  try {
    for (const r of await statusPromise) {
      statusCounts[r.status as ContactStatusKey] = Number(r.count);
    }
  } catch {
    // CRM-Zählung optional — bei DB-Fehler bleibt der Trichter-Unterbau leer.
  }

  return (
    <StatistikDashboard
      overview={overview}
      daily={daily}
      campaigns={campaigns}
      statusCounts={statusCounts}
      range={range}
      rangeLabel={rangeLabel}
      error={error}
      rateLimited={rateLimited}
    />
  );
}
