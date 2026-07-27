/**
 * Schlanker Client für die Instantly.ai v2-API (Cold-Email/Outbound).
 *
 * Nur serverseitig nutzen (liest INSTANTLY_API_KEY). Dieselbe Workspace-Bindung
 * wie die CLI (`npm run instantly`) — der Key gehört zum Workspace "Sascha".
 * Wird ausschließlich aus Server-Actions importiert, nie aus Client-Komponenten.
 */

import type { InstantlyCampaign } from "@/lib/scraping-types";

const BASE =
  process.env.INSTANTLY_API_BASE_URL?.trim() || "https://api.instantly.ai/api/v2";

function apiKey(): string {
  const k = process.env.INSTANTLY_API_KEY?.trim();
  if (!k) {
    throw new Error(
      `INSTANTLY_API_KEY fehlt zur Laufzeit (defined=${
        process.env.INSTANTLY_API_KEY !== undefined
      }, len=${(process.env.INSTANTLY_API_KEY ?? "").length})`,
    );
  }
  return k;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      // Content-Type NUR bei vorhandenem Body senden. Bei body-losen DELETEs
      // (z. B. Kampagne/Lead löschen) lehnt Instantly sonst mit 400 ab:
      // FST_ERR_CTP_EMPTY_JSON_BODY ("Body cannot be empty when content-type
      // is set to 'application/json'").
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      // Instantlys WAF blockt Requests ohne/mit generischem User-Agent (403).
      "User-Agent": "sk-kommandozentrale/1.0",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Instantly ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Alle Kampagnen des Workspaces (paginiert, bis ~500). */
export async function listCampaigns(): Promise<InstantlyCampaign[]> {
  const out: InstantlyCampaign[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await call<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[];
      next_starting_after?: string;
    }>(`/campaigns?${qs.toString()}`);
    const items = data.items ?? [];
    for (const c of items) {
      out.push({
        id: c.id,
        name: c.name ?? "(ohne Name)",
        status: typeof c.status === "number" ? c.status : null,
      });
    }
    if (items.length < 100 || !data.next_starting_after) break;
    cursor = data.next_starting_after;
  }
  return out;
}

export type InstantlyAccount = {
  email: string;
  status: number | null;
  warmupScore: number | null;
};

/** Verbundene Absender-Postfächer (paginiert). */
export async function listAccounts(): Promise<InstantlyAccount[]> {
  const out: InstantlyAccount[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await call<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[];
      next_starting_after?: string;
    }>(`/accounts?${qs.toString()}`);
    const items = data.items ?? [];
    for (const a of items) {
      out.push({
        email: a.email,
        status: typeof a.status === "number" ? a.status : null,
        warmupScore:
          typeof a.stat_warmup_score === "number" ? a.stat_warmup_score : null,
      });
    }
    if (items.length < 100 || !data.next_starting_after) break;
    cursor = data.next_starting_after;
  }
  return out;
}

// --- Kampagnen-Sequenz (Copy) ----------------------------------------------

export type InstantlyStepVariant = { subject: string; body: string };
export type InstantlyStep = {
  type: "email";
  delay: number; // Tage vor diesem Schritt (0 = sofort, Follow-up = N Tage)
  variants: InstantlyStepVariant[];
};
export type InstantlySequence = { steps: InstantlyStep[] };

/** Eine Kampagne inkl. Sequenz/Status holen (für Prefill im Assistenten). */
export async function getCampaign(id: string): Promise<{
  id: string;
  name: string;
  status: number | null;
  sequences: InstantlySequence[];
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = await call<any>(`/campaigns/${id}`);
  return {
    id: c.id,
    name: c.name ?? "",
    status: typeof c.status === "number" ? c.status : null,
    sequences: Array.isArray(c.sequences) ? c.sequences : [],
  };
}

// Die v2-API verlangt campaign_schedule zwingend. Fester Standard: Mo–Fr 8–16 Uhr
// Berliner Zeit. Instantlys Zeitzonen-Enum akzeptiert "Europe/Berlin" NICHT (gegen
// die echte API verifiziert: 400 „must be equal to one of the allowed values") —
// für CET/CEST nutzen wir "Europe/Belgrade": exakt derselbe Offset + EU-Sommerzeit
// wie Berlin, also identische Sendezeiten (nur das Instantly-UI beschriftet die
// Zeitzone mit „Belgrade, Bratislava …" statt „Berlin").
const DEFAULT_SCHEDULE = {
  schedules: [
    {
      name: "Default schedule",
      timing: { from: "08:00", to: "16:00" },
      days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
      timezone: "Europe/Belgrade",
    },
  ],
};

// Tägliches Sendelimit pro Kampagne ("Optionen" → "Tägliches Limit"). Ohne
// Angabe setzt Instantly selbst 30 — zu wenig. Gilt nur für neu angelegte
// Kampagnen; ein im Instantly-UI geänderter Wert bleibt erhalten.
const DEFAULT_DAILY_LIMIT = 100;

// "Optionen" → "Zustelloptimierung" → "E-Mails nur als Text senden (kein HTML)".
// Reine Textmails landen seltener im Spam. Unsere Mailtexte werden ohnehin aus
// einfachem Text erzeugt (textToHtml), es geht also keine Formatierung verloren.
// Nebeneffekt: ohne HTML gibt es kein Zählpixel, Öffnungs-Tracking ist damit aus.
const DEFAULT_TEXT_ONLY = true;

export async function createCampaign(input: {
  name: string;
  sequences: InstantlySequence[];
  emailList?: string[];
}): Promise<{ id: string }> {
  const body: Record<string, unknown> = {
    name: input.name,
    sequences: input.sequences,
    campaign_schedule: DEFAULT_SCHEDULE,
    daily_limit: DEFAULT_DAILY_LIMIT,
    text_only: DEFAULT_TEXT_ONLY,
  };
  if (input.emailList?.length) body.email_list = input.emailList;
  const data = await call<{ id: string }>("/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: data.id };
}

export async function updateCampaign(
  id: string,
  input: {
    name?: string;
    sequences?: InstantlySequence[];
    emailList?: string[];
    /** Standard-Schedule (Mo–Fr 8–16 Berlin) mit erzwingen. Default: an. */
    enforceSchedule?: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.sequences !== undefined) body.sequences = input.sequences;
  if (input.emailList?.length) body.email_list = input.emailList;
  if (input.enforceSchedule !== false) body.campaign_schedule = DEFAULT_SCHEDULE;
  await call(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Kampagne samt Leads in Instantly löschen. */
export async function deleteCampaign(id: string): Promise<void> {
  await call(`/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function activateCampaign(id: string): Promise<void> {
  await call(`/campaigns/${id}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Kampagne pausieren (Status → 2, kein Versand). Für den "Draft"-Zustand. */
export async function pauseCampaign(id: string): Promise<void> {
  await call(`/campaigns/${id}/pause`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// --- Postfach: Accounts-Tracking --------------------------------------------

export type InstantlyAccountFull = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** 1 Aktiv, 2 Pausiert, 3 Wartung, -1 Verbindungsfehler, -2 Soft-Bounce, -3 Sendefehler */
  status: number | null;
  statusMessage: string | null;
  /** 1 Aktiv, 0 Pausiert, -1 Gesperrt, -2 Spam-Ordner, -3 Suspendiert */
  warmupStatus: number | null;
  warmupScore: number | null;
  dailyLimit: number | null;
  /** 1 IMAP/SMTP, 2 Google, 3 Microsoft, 4 AWS, 8 AirMail */
  providerCode: number | null;
  timestampCreated: string | null;
  timestampLastUsed: string | null;
};

/** Absender-Postfächer mit allen Tracking-Feldern (paginiert). */
export async function listAccountsFull(): Promise<InstantlyAccountFull[]> {
  const out: InstantlyAccountFull[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const data = await call<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[];
      next_starting_after?: string;
    }>(`/accounts?${qs.toString()}`);
    const items = data.items ?? [];
    for (const a of items) {
      out.push({
        email: a.email,
        firstName: a.first_name ?? null,
        lastName: a.last_name ?? null,
        status: typeof a.status === "number" ? a.status : null,
        statusMessage: a.status_message?.e_message ?? null,
        warmupStatus:
          typeof a.warmup_status === "number" ? a.warmup_status : null,
        warmupScore:
          typeof a.stat_warmup_score === "number" ? a.stat_warmup_score : null,
        dailyLimit: typeof a.daily_limit === "number" ? a.daily_limit : null,
        providerCode:
          typeof a.provider_code === "number" ? a.provider_code : null,
        timestampCreated: a.timestamp_created ?? null,
        timestampLastUsed: a.timestamp_last_used ?? null,
      });
    }
    if (items.length < 100 || !data.next_starting_after) break;
    cursor = data.next_starting_after;
  }
  return out;
}

export type WarmupAggregate = {
  sent: number;
  received: number;
  landedInbox: number;
  landedSpam: number;
  healthScore: number | null;
};

export type WarmupDay = { sent: number; landedInbox: number; landedSpam: number };

/** Warmup-Analytics für bis zu 100 Accounts (Aggregat + Tagesdaten). */
export async function getWarmupAnalytics(emails: string[]): Promise<{
  aggregate: Record<string, WarmupAggregate>;
  perDay: Record<string, Record<string, WarmupDay>>;
}> {
  if (emails.length === 0) return { aggregate: {}, perDay: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await call<any>("/accounts/warmup-analytics", {
    method: "POST",
    body: JSON.stringify({ emails: emails.slice(0, 100) }),
  });
  const aggregate: Record<string, WarmupAggregate> = {};
  for (const [email, v] of Object.entries(data.aggregate_data ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = v as any;
    aggregate[email] = {
      sent: a?.sent ?? 0,
      received: a?.received ?? 0,
      landedInbox: a?.landed_inbox ?? 0,
      landedSpam: a?.landed_spam ?? 0,
      healthScore: typeof a?.health_score === "number" ? a.health_score : null,
    };
  }
  const perDay: Record<string, Record<string, WarmupDay>> = {};
  for (const [email, days] of Object.entries(data.email_date_data ?? {})) {
    perDay[email] = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [day, v] of Object.entries((days ?? {}) as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = v as any;
      perDay[email][day] = {
        sent: d?.sent ?? 0,
        landedInbox: d?.landed_inbox ?? 0,
        landedSpam: d?.landed_spam ?? 0,
      };
    }
  }
  return { aggregate, perDay };
}

export type AccountDailyStat = {
  email: string;
  date: string;
  sent: number;
  opened: number;
  replies: number;
  bounced: number;
};

/** Sende-Statistik pro Account & Tag (Kampagnen-Versand, nicht Warmup). */
export async function getAccountDailyAnalytics(
  startDate: string,
  endDate: string,
): Promise<AccountDailyStat[]> {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await call<any>(`/accounts/analytics/daily?${qs.toString()}`);
  const rows = Array.isArray(data) ? data : (data?.items ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    email: r.email ?? r.eaccount ?? r.account ?? "",
    date: r.date ?? r.day ?? "",
    sent: r.sent ?? 0,
    opened: r.opened ?? r.unique_opened ?? 0,
    replies: r.replies ?? r.reply_count ?? 0,
    bounced: r.bounced ?? 0,
  }));
}

export async function pauseAccount(email: string): Promise<void> {
  await call(`/accounts/${encodeURIComponent(email)}/pause`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resumeAccount(email: string): Promise<void> {
  await call(`/accounts/${encodeURIComponent(email)}/resume`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// --- Postfach: Unibox (E-Mails) ---------------------------------------------

/** Roh-Form eines Instantly-Email-Objekts (Felder, die wir nutzen). */
export type InstantlyEmailRaw = {
  id: string;
  thread_id: string | null;
  campaign_id: string | null;
  eaccount: string | null;
  lead: string | null;
  /** 1 Kampagnen-Versand, 2 Empfangen, 3 Gesendet, 4 Geplant */
  ue_type: number | null;
  is_unread: number | null;
  i_status: number | null;
  subject: string | null;
  content_preview: string | null;
  body?: { html?: string | null; text?: string | null } | null;
  from_address_email: string | null;
  to_address_email_list: string | null;
  timestamp_created: string;
  timestamp_email: string;
};

export async function listEmails(params: {
  emailType?: "received" | "sent" | "manual";
  minTimestampCreated?: string;
  startingAfter?: string;
  threadId?: string;
  limit?: number;
  sortOrder?: "asc" | "desc";
}): Promise<{ items: InstantlyEmailRaw[]; nextStartingAfter: string | null }> {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.emailType) qs.set("email_type", params.emailType);
  if (params.minTimestampCreated)
    qs.set("min_timestamp_created", params.minTimestampCreated);
  if (params.startingAfter) qs.set("starting_after", params.startingAfter);
  if (params.threadId) qs.set("search", `thread:${params.threadId}`);
  if (params.sortOrder) qs.set("sort_order", params.sortOrder);
  const data = await call<{
    items?: InstantlyEmailRaw[];
    next_starting_after?: string;
  }>(`/emails?${qs.toString()}`);
  return {
    items: data.items ?? [],
    nextStartingAfter: data.next_starting_after ?? null,
  };
}

export async function getEmail(id: string): Promise<InstantlyEmailRaw> {
  return call<InstantlyEmailRaw>(`/emails/${encodeURIComponent(id)}`);
}

/** Antwort auf eine vorhandene Mail (Instantly kann kein freies Compose). */
export async function replyToEmail(input: {
  replyToUuid: string;
  eaccount: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}): Promise<InstantlyEmailRaw> {
  return call<InstantlyEmailRaw>("/emails/reply", {
    method: "POST",
    body: JSON.stringify({
      reply_to_uuid: input.replyToUuid,
      eaccount: input.eaccount,
      subject: input.subject,
      body: { html: input.bodyHtml, text: input.bodyText },
    }),
  });
}

export async function markThreadAsRead(threadId: string): Promise<void> {
  await call(`/emails/threads/${encodeURIComponent(threadId)}/mark-as-read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getUnreadCount(): Promise<number> {
  const data = await call<{ count?: number }>("/emails/unread/count");
  return data.count ?? 0;
}

/**
 * Lead-Interesse setzen (läuft bei Instantly als Background-Job, 202).
 * 1 Interessiert · 2 Meeting gebucht · 4 Gewonnen · 0 Out of Office ·
 * -1 Nicht interessiert · -2 Falsche Person · -3 Verloren · null = zurücksetzen
 */
export async function updateLeadInterestStatus(input: {
  leadEmail: string;
  interestValue: number | null;
  campaignId?: string | null;
}): Promise<void> {
  const body: Record<string, unknown> = {
    lead_email: input.leadEmail,
    interest_value: input.interestValue,
  };
  if (input.campaignId) body.campaign_id = input.campaignId;
  await call("/leads/update-interest-status", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Postfach: Webhooks -------------------------------------------------------

export type InstantlyWebhook = {
  id: string;
  target_hook_url: string;
  event_type: string | null;
  /** 1 aktiv, -1 wegen Zustellfehlern deaktiviert */
  status: number | null;
};

export async function listWebhooks(): Promise<InstantlyWebhook[]> {
  const data = await call<{ items?: InstantlyWebhook[] }>("/webhooks");
  return data.items ?? [];
}

export async function createWebhook(input: {
  targetHookUrl: string;
  eventType: string;
  name?: string;
  headers?: Record<string, string>;
}): Promise<InstantlyWebhook> {
  return call<InstantlyWebhook>("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      target_hook_url: input.targetHookUrl,
      event_type: input.eventType,
      name: input.name ?? null,
      headers: input.headers ?? null,
    }),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await call(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Kampagnen-Statistik (Analytics) ----------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Workspace-Aggregat über alle (gefilterten) Kampagnen in einem Zeitraum. */
export type CampaignOverview = {
  emailsSent: number;
  contacted: number;
  newLeadsContacted: number;
  openCount: number;
  openUnique: number;
  linkClickCount: number;
  linkClickUnique: number;
  replyCount: number;
  replyUnique: number;
  bounced: number;
  unsubscribed: number;
  opportunities: number;
  opportunityValue: number;
  interested: number;
  meetingBooked: number;
  meetingCompleted: number;
  closed: number;
};

const EMPTY_OVERVIEW: CampaignOverview = {
  emailsSent: 0,
  contacted: 0,
  newLeadsContacted: 0,
  openCount: 0,
  openUnique: 0,
  linkClickCount: 0,
  linkClickUnique: 0,
  replyCount: 0,
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

/**
 * GET /campaigns/analytics/overview — ein Objekt mit den Summen des Zeitraums.
 * Ohne Datumsgrenzen liefert Instantly den Lifetime-Wert.
 */
export async function getCampaignOverview(
  startDate?: string,
  endDate?: string,
): Promise<CampaignOverview> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = await call<any>(`/campaigns/analytics/overview${suffix}`);
  if (!d || typeof d !== "object") return { ...EMPTY_OVERVIEW };
  return {
    emailsSent: num(d.emails_sent_count),
    contacted: num(d.contacted_count),
    newLeadsContacted: num(d.new_leads_contacted_count),
    openCount: num(d.open_count),
    openUnique: num(d.open_count_unique),
    linkClickCount: num(d.link_click_count),
    linkClickUnique: num(d.link_click_count_unique),
    replyCount: num(d.reply_count),
    replyUnique: num(d.reply_count_unique),
    bounced: num(d.bounced_count),
    unsubscribed: num(d.unsubscribed_count),
    opportunities: num(d.total_opportunities),
    opportunityValue: num(d.total_opportunity_value),
    interested: num(d.total_interested),
    meetingBooked: num(d.total_meeting_booked),
    meetingCompleted: num(d.total_meeting_completed),
    closed: num(d.total_closed),
  };
}

/** GET /campaigns/analytics — Kennzahlen pro Kampagne. */
export type CampaignStat = {
  campaignId: string;
  campaignName: string;
  status: number | null;
  isEvergreen: boolean;
  leads: number;
  contacted: number;
  emailsSent: number;
  openCount: number;
  replyCount: number;
  linkClickCount: number;
  bounced: number;
  unsubscribed: number;
  completed: number;
  newLeadsContacted: number;
  opportunities: number;
  opportunityValue: number;
};

export async function getCampaignAnalytics(
  startDate?: string,
  endDate?: string,
): Promise<CampaignStat[]> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await call<any>(`/campaigns/analytics${suffix}`);
  const rows = Array.isArray(data) ? data : (data?.items ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    campaignId: r.campaign_id ?? r.id ?? "",
    campaignName: r.campaign_name ?? r.name ?? "(ohne Name)",
    status: typeof r.campaign_status === "number" ? r.campaign_status : null,
    isEvergreen: Boolean(r.campaign_is_evergreen),
    leads: num(r.leads_count),
    contacted: num(r.contacted_count),
    emailsSent: num(r.emails_sent_count),
    openCount: num(r.open_count),
    replyCount: num(r.reply_count),
    linkClickCount: num(r.link_click_count),
    bounced: num(r.bounced_count),
    unsubscribed: num(r.unsubscribed_count),
    completed: num(r.completed_count),
    newLeadsContacted: num(r.new_leads_contacted_count),
    opportunities: num(r.total_opportunities),
    opportunityValue: num(r.total_opportunity_value),
  }));
}

/** GET /campaigns/analytics/daily — Tageszeitreihe (Chart). */
export type CampaignDailyStat = {
  date: string;
  sent: number;
  opened: number;
  uniqueOpened: number;
  replies: number;
  uniqueReplies: number;
  clicks: number;
  uniqueClicks: number;
};

export async function getCampaignDailyAnalytics(
  startDate: string,
  endDate: string,
  campaignId?: string,
): Promise<CampaignDailyStat[]> {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (campaignId) qs.set("campaign_id", campaignId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await call<any>(`/campaigns/analytics/daily?${qs.toString()}`);
  const rows = Array.isArray(data) ? data : (data?.items ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows
    .map((r: any) => ({
      date: r.date ?? r.day ?? "",
      sent: num(r.sent ?? r.emails_sent_count),
      opened: num(r.opened ?? r.open_count),
      uniqueOpened: num(r.unique_opened ?? r.open_count_unique),
      replies: num(r.replies ?? r.reply_count),
      uniqueReplies: num(r.unique_replies ?? r.reply_count_unique),
      clicks: num(r.clicks ?? r.link_click_count),
      uniqueClicks: num(r.unique_clicks ?? r.link_click_count_unique),
    }))
    .filter((r: CampaignDailyStat) => r.date)
    .sort((a: CampaignDailyStat, b: CampaignDailyStat) =>
      a.date.localeCompare(b.date),
    );
}

export type InstantlyLead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  phone?: string;
  custom_variables?: Record<string, string>;
};

/**
 * Lead-ID zu einer E-Mail finden. Dieselbe Adresse kann in mehreren Kampagnen
 * stecken — dann gibt es pro Kampagne einen eigenen Lead-Datensatz mit eigener
 * ID. Ohne `campaignId` gewinnt der erste Treffer, was beim Aktualisieren oder
 * Löschen den falschen Datensatz erwischen würde. Der Filter heißt `campaign`
 * (gegen die API verifiziert: `campaign_id` wird stillschweigend ignoriert).
 */
export async function findLeadIdByEmail(
  email: string,
  campaignId?: string,
): Promise<string | null> {
  const body: Record<string, unknown> = { search: email, limit: 10 };
  if (campaignId) body.campaign = campaignId;
  const data = await call<{ items?: Array<{ id: string; email?: string }> }>(
    "/leads/list",
    { method: "POST", body: JSON.stringify(body) },
  );
  const items = data.items ?? [];
  const hit = items.find(
    (x) => (x.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  return hit?.id ?? null;
}

/**
 * Alle Kampagnen-IDs, in denen ein Lead mit dieser E-Mail bereits existiert
 * (workspace-weit). Für den Duplikat-Check über Kampagnengrenzen hinweg.
 */
export async function findLeadCampaignsByEmail(email: string): Promise<string[]> {
  const data = await call<{
    items?: Array<{ email?: string; campaign?: string }>;
  }>("/leads/list", {
    method: "POST",
    body: JSON.stringify({ search: email, limit: 10 }),
  });
  return (data.items ?? [])
    .filter((x) => (x.email ?? "").toLowerCase() === email.toLowerCase())
    .map((x) => x.campaign ?? "")
    .filter(Boolean);
}

/**
 * Bestehenden Lead aktualisieren (PATCH). Wichtig: /leads/add aktualisiert
 * vorhandene Leads NICHT (meldet sie nur als Duplikat) — nur so bleiben die
 * Spalten/Variablen in Instantly dauerhaft mit der Tabelle synchron.
 */
export async function updateLead(
  id: string,
  lead: InstantlyLead,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (lead.first_name !== undefined) body.first_name = lead.first_name;
  if (lead.last_name !== undefined) body.last_name = lead.last_name;
  if (lead.company_name !== undefined) body.company_name = lead.company_name;
  if (lead.website !== undefined) body.website = lead.website;
  if (lead.phone !== undefined) body.phone = lead.phone;
  if (lead.custom_variables !== undefined)
    body.custom_variables = lead.custom_variables;
  await call(`/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Einen Lead endgültig löschen (workspace-weit, über die Lead-ID). */
export async function deleteLead(id: string): Promise<void> {
  await call(`/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Leads anhand ihrer E-Mails in Instantly löschen (Best-Effort). Für jede E-Mail
 * wird die Lead-ID gesucht und der Lead gelöscht. `campaignId` grenzt das auf
 * eine Kampagne ein — sonst könnte derselbe Lead in einer anderen Kampagne
 * erwischt werden. Einzelne Fehler brechen den
 * Rest NICHT ab (das lokale Löschen soll nie an Instantly scheitern).
 * Gibt die Anzahl tatsächlich gelöschter Leads zurück.
 */
export async function deleteLeadsByEmails(
  emails: string[],
  campaignId?: string,
): Promise<number> {
  const unique = [
    ...new Set(
      emails
        .map((e) => (e ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
  let deleted = 0;
  for (const email of unique) {
    try {
      const id = await findLeadIdByEmail(email, campaignId);
      if (!id) continue;
      await deleteLead(id);
      deleted += 1;
    } catch (err) {
      console.error(`Instantly: Lead „${email}" konnte nicht gelöscht werden:`, err);
    }
  }
  return deleted;
}

/**
 * Leads in eine Kampagne einspielen (bis zu 1000/Call).
 *
 * Achtung bei `skipIfInCampaign`: Instantly liest das als „steckt schon in
 * IRGENDEINER Kampagne", nicht als „schon in dieser Kampagne" — gegen die echte
 * API verifiziert. Auf `true` wird ein Lead also stillschweigend übersprungen,
 * bloß weil er in einer anderen Kampagne läuft. Default darum `false`; der
 * Duplikat-Wunsch kommt aus dem Haken im Kampagnen-Dialog.
 *
 * Doppelte Leads INNERHALB derselben Kampagne entstehen dadurch nicht: die
 * lehnt Instantly unabhängig von diesen Flags ab (Antwort `duplicated_leads`).
 */
export async function bulkAddLeads(
  campaignId: string,
  leads: InstantlyLead[],
  opts?: { skipIfInCampaign?: boolean; skipIfInWorkspace?: boolean },
): Promise<unknown> {
  // Endpoint der v2-CLI für "leads bulk-add" ist POST /leads/add (nicht /leads/bulk-add).
  return call("/leads/add", {
    method: "POST",
    body: JSON.stringify({
      campaign_id: campaignId,
      leads,
      skip_if_in_campaign: opts?.skipIfInCampaign ?? false,
      skip_if_in_workspace: opts?.skipIfInWorkspace ?? false,
    }),
  });
}
