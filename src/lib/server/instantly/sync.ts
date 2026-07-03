/**
 * Sync-Logik für den Unibox-Spiegel (instantly_emails).
 *
 * Primärkanal ist der Instantly-Webhook (reply_received); dieser Poll-Backfill
 * dient als Reconciliation und Initial-Import. GET /emails ist hart auf
 * 20 Requests/Minute limitiert — deshalb Seiten-Kappung pro Aufruf und
 * Staleness-Guard (maybeSyncInstantly) statt Polling.
 */

import { sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { instantlyEmails, syncState } from "@/db/schema";
import {
  listCampaigns,
  listEmails,
  type InstantlyEmailRaw,
} from "@/lib/server/instantly/client";

const CURSOR_KEY = "instantly_emails_cursor";
const LAST_SYNC_KEY = "instantly_emails_last_sync";

export async function getSyncValue(
  orgId: string,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ value: syncState.value })
    .from(syncState)
    .where(and(eq(syncState.orgId, orgId), eq(syncState.key, key)))
    .limit(1);
  return row?.value ?? null;
}

export async function setSyncValue(
  orgId: string,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(syncState)
    .values({ orgId, key, value })
    .onConflictDoUpdate({
      target: [syncState.orgId, syncState.key],
      set: { value, updatedAt: sql`now()` },
    });
}

/** Instantly-Rohobjekt → Tabellenzeile. */
function toRow(orgId: string, m: InstantlyEmailRaw, campaignName: string | null) {
  return {
    id: m.id,
    orgId,
    threadId: m.thread_id ?? null,
    campaignId: m.campaign_id ?? null,
    campaignName,
    eaccount: m.eaccount ?? null,
    leadEmail: m.lead ?? (m.ue_type === 2 ? m.from_address_email : null),
    direction: (m.ue_type === 2 ? "in" : "out") as "in" | "out",
    subject: m.subject ?? null,
    bodyHtml: m.body?.html ?? null,
    bodyText: m.body?.text ?? null,
    contentPreview: m.content_preview ?? null,
    isUnread: Number(m.is_unread) === 1,
    iStatus: typeof m.i_status === "number" ? m.i_status : null,
    timestampCreated: new Date(m.timestamp_created),
    timestampEmail: new Date(m.timestamp_email ?? m.timestamp_created),
    raw: m as unknown as Record<string, unknown>,
  };
}

/**
 * E-Mails upserten (id = Instantly-UUID) und Kontakte über die Lead-Adresse
 * matchen. Idempotent — Webhook-Duplikate und Cursor-Überlappung sind ok.
 */
export async function upsertInstantlyEmails(
  orgId: string,
  raws: InstantlyEmailRaw[],
  campaignNames?: Map<string, string>,
): Promise<void> {
  if (raws.length === 0) return;
  const rows = raws
    .filter((m) => m && typeof m.id === "string" && m.timestamp_created)
    .map((m) =>
      toRow(
        orgId,
        m,
        (m.campaign_id && campaignNames?.get(m.campaign_id)) || null,
      ),
    );
  if (rows.length === 0) return;

  await db
    .insert(instantlyEmails)
    .values(rows)
    .onConflictDoUpdate({
      target: instantlyEmails.id,
      set: {
        subject: sql`excluded.subject`,
        bodyHtml: sql`excluded.body_html`,
        bodyText: sql`excluded.body_text`,
        contentPreview: sql`excluded.content_preview`,
        // Monoton: einmal gelesen bleibt gelesen. Verhindert, dass ein
        // syncThread direkt nach dem Öffnen (Instantly meldet noch unread)
        // den lokalen Gelesen-Status wieder zurückdreht.
        isUnread: sql`excluded.is_unread AND ${instantlyEmails.isUnread}`,
        // coalesce: Instantlys update-interest-status läuft asynchron (202) —
        // stale nulls dürfen frisch gesetzte lokale Status nicht wegschreiben.
        // (Trade-off: ein echtes Zurücksetzen auf null propagiert nicht.)
        iStatus: sql`coalesce(excluded.i_status, ${instantlyEmails.iStatus})`,
        campaignName: sql`coalesce(excluded.campaign_name, ${instantlyEmails.campaignName})`,
        raw: sql`excluded.raw`,
      },
    });

  // Kontakt-Match: Lead-Adresse ↔ CRM-Kontakt (case-insensitive, org-scoped).
  await db.execute(sql`
    UPDATE instantly_emails ie
    SET contact_id = c.id
    FROM contacts c
    WHERE ie.org_id = ${orgId}
      AND ie.contact_id IS NULL
      AND ie.lead_email IS NOT NULL
      AND c.org_id = ie.org_id
      AND lower(c.email) = lower(ie.lead_email)
  `);
}

/**
 * Backfill: empfangene Mails seit Cursor importieren (aufsteigend, resumierbar).
 * Max. `maxPages` Seiten à 100 pro Aufruf (Budget: 20 GET /emails pro Minute).
 */
export async function syncInstantlyEmails(
  orgId: string,
  opts?: { maxPages?: number },
): Promise<number> {
  const maxPages = opts?.maxPages ?? 5;
  const cursor = await getSyncValue(orgId, CURSOR_KEY);

  let campaignNames: Map<string, string> | undefined;
  try {
    campaignNames = new Map(
      (await listCampaigns()).map((c) => [c.id, c.name]),
    );
  } catch {
    campaignNames = undefined; // Namen sind nice-to-have, kein Blocker
  }

  let startingAfter: string | undefined;
  let newest = cursor;
  let imported = 0;

  try {
    for (let page = 0; page < maxPages; page++) {
      const { items, nextStartingAfter } = await listEmails({
        emailType: "received",
        minTimestampCreated: cursor ?? undefined,
        sortOrder: "asc",
        startingAfter,
      });
      if (items.length === 0) break;
      await upsertInstantlyEmails(orgId, items, campaignNames);
      imported += items.length;
      for (const m of items) {
        if (!newest || m.timestamp_created > newest)
          newest = m.timestamp_created;
      }
      // Fortschritt pro Seite sichern — ein Abbruch auf Seite N verliert
      // die bereits importierten Seiten nicht.
      if (newest && newest !== cursor) {
        await setSyncValue(orgId, CURSOR_KEY, newest);
      }
      if (!nextStartingAfter) break;
      startingAfter = nextStartingAfter;
    }
  } finally {
    // Auch bei Fehlern (z. B. Instantly 429) stempeln: der Staleness-Guard
    // in maybeSyncInstantly wirkt dann als Backoff statt Retry pro Render.
    try {
      await setSyncValue(orgId, LAST_SYNC_KEY, new Date().toISOString());
    } catch {
      // DB-Fehler hier darf den Originalfehler nicht maskieren
    }
  }
  return imported;
}

/** Sync nur, wenn der letzte länger als `maxAgeMs` her ist (Default 2 min). */
export async function maybeSyncInstantly(
  orgId: string,
  maxAgeMs = 2 * 60 * 1000,
): Promise<void> {
  const last = await getSyncValue(orgId, LAST_SYNC_KEY);
  if (last && Date.now() - new Date(last).getTime() < maxAgeMs) return;
  await syncInstantlyEmails(orgId);
}

/**
 * Kompletten Thread live nachladen (inkl. gesendeter Mails) und spiegeln.
 * Kampagnennamen bleiben über das coalesce im Upsert erhalten.
 */
export async function syncThread(
  orgId: string,
  threadId: string,
): Promise<void> {
  const { items } = await listEmails({ threadId, limit: 100 });
  await upsertInstantlyEmails(orgId, items);
}
