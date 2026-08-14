/**
 * E-Mail-Verlauf eines Kontakts — führt zwei Quellen zu einer Zeitleiste zusammen:
 *
 *  1. Das echte Postfach (IMAP, live): alle Mails, an denen eine Adresse des
 *     Kontakts beteiligt ist — Posteingang liefert seine Antworten, „Gesendet"
 *     die eigenen Mails an ihn.
 *  2. Die Kampagnenmails aus Instantly (DB-Spiegel `instantly_emails`).
 *
 * Gesucht wird nach BEIDEN Adressen eines Leads: der normalen E-Mail und der
 * verifizierten Entscheider-E-Mail (Spalte Email_Entscheider) — versendet wird
 * schließlich auch an die eine oder die andere.
 *
 * Nur serverseitig importieren (öffnet IMAP-Verbindungen).
 */

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, instantlyEmails } from "@/db/schema";
import { EMAIL_FINDER_KEY } from "@/lib/scraping-types";
import { getMailboxConfig } from "@/lib/server/mailbox/config";
import {
  peekMessageBody,
  searchMessagesByAddresses,
} from "@/lib/server/mailbox/imap";
import { folderLabel } from "@/lib/mailbox-ui";
import { htmlToPlainText } from "@/lib/signature";
import type {
  ContactMailBody,
  ContactMailBodyRef,
  ContactMailHistory,
  ContactMailItem,
} from "@/lib/contact-mails";

const PREVIEW_CHARS = 160;

function shorten(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS)}…` : t;
}

/**
 * Alle Adressen, unter denen dieser Kontakt erreichbar ist: die normale E-Mail
 * und — falls verifiziert — die Entscheider-E-Mail aus dem Enrichment.
 */
export function contactMailAddresses(contact: {
  email: string | null;
  customFields: unknown;
}): string[] {
  const out = new Set<string>();

  const plain = (contact.email ?? "").trim().toLowerCase();
  if (plain.includes("@")) out.add(plain);

  const cells = (contact.customFields as { cells?: Record<string, unknown> })
    ?.cells;
  const cell = cells?.[EMAIL_FINDER_KEY] as
    | { status?: string; value?: unknown }
    | undefined;
  if (cell?.status === "success") {
    const found = String(cell.value ?? "").trim().toLowerCase();
    if (found.includes("@")) out.add(found);
  }

  return [...out];
}

/** Verlauf eines Kontakts, neueste Nachricht zuerst. */
export async function getContactMailHistory(
  orgId: string,
  contactId: string,
): Promise<ContactMailHistory> {
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      customFields: contacts.customFields,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) throw new Error("Kontakt nicht gefunden.");

  const addresses = contactMailAddresses(contact);

  const [campaign, postfach] = await Promise.all([
    loadCampaignMails(orgId, contactId, addresses),
    loadPostfachMails(addresses),
  ]);

  const items = [...campaign, ...postfach.items].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  return { items, addresses, postfachError: postfach.error };
}

// --- Quelle 1: Kampagnenmails (Instantly-Spiegel) ----------------------------

async function loadCampaignMails(
  orgId: string,
  contactId: string,
  addresses: string[],
): Promise<ContactMailItem[]> {
  const match = addresses.length
    ? or(
        eq(instantlyEmails.contactId, contactId),
        inArray(sql`lower(coalesce(${instantlyEmails.leadEmail}, ''))`, addresses),
      )
    : eq(instantlyEmails.contactId, contactId);

  const rows = await db
    .select({
      id: instantlyEmails.id,
      direction: instantlyEmails.direction,
      subject: instantlyEmails.subject,
      contentPreview: instantlyEmails.contentPreview,
      bodyText: instantlyEmails.bodyText,
      bodyHtml: instantlyEmails.bodyHtml,
      leadEmail: instantlyEmails.leadEmail,
      campaignName: instantlyEmails.campaignName,
      timestampEmail: instantlyEmails.timestampEmail,
    })
    .from(instantlyEmails)
    .where(and(eq(instantlyEmails.orgId, orgId), match))
    .orderBy(desc(instantlyEmails.timestampEmail))
    .limit(60);

  return rows.map((r) => ({
    id: `kampagne:${r.id}`,
    source: "kampagne" as const,
    direction: r.direction,
    subject: r.subject,
    preview:
      shorten(r.contentPreview) ??
      shorten(r.bodyText) ??
      shorten(r.bodyHtml ? htmlToPlainText(r.bodyHtml) : null),
    date: r.timestampEmail.toISOString(),
    counterpart: r.leadEmail,
    folder: null,
    uid: null,
    folderLabel: null,
    campaignMailId: r.id,
    campaignName: r.campaignName,
    hasAttachments: false,
  }));
}

// --- Quelle 2: echtes Postfach (IMAP) ----------------------------------------

async function loadPostfachMails(
  addresses: string[],
): Promise<{ items: ContactMailItem[]; error: string | null }> {
  if (addresses.length === 0) return { items: [], error: null };
  if (!getMailboxConfig()) return { items: [], error: null };

  try {
    const matches = await searchMessagesByAddresses(addresses);
    const items = matches.map((m) => {
      const from = m.from?.address?.toLowerCase() ?? "";
      // Kommt die Mail von einer Adresse des Kontakts, ist sie eingehend —
      // sonst haben wir ihm geschrieben (deckt auch eigene Unterordner ab).
      const incoming = addresses.includes(from);
      const recipients = m.to.map((t) => t.address).filter(Boolean);
      return {
        id: `postfach:${m.folder}:${m.uid}`,
        source: "postfach" as const,
        direction: incoming ? ("in" as const) : ("out" as const),
        subject: m.subject,
        preview: null, // Text wird erst beim Aufklappen geladen
        date: m.date,
        counterpart: incoming
          ? (m.from?.address ?? null)
          : (recipients[0] ?? null),
        folder: m.folder,
        uid: m.uid,
        folderLabel: folderLabel({
          specialUse: m.folderSpecialUse,
          name: m.folderName,
          path: m.folder,
        }),
        campaignMailId: null,
        campaignName: null,
        hasAttachments: m.hasAttachments,
      };
    });
    return { items, error: null };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : "Postfach nicht erreichbar",
    };
  }
}

// --- Nachricht aufklappen ----------------------------------------------------

/** Text einer einzelnen Nachricht nachladen (erst beim Aufklappen). */
export async function getContactMailBody(
  orgId: string,
  ref: ContactMailBodyRef,
): Promise<ContactMailBody> {
  if (ref.source === "postfach") {
    return peekMessageBody(ref.folder, ref.uid);
  }

  const [row] = await db
    .select({
      bodyHtml: instantlyEmails.bodyHtml,
      bodyText: instantlyEmails.bodyText,
    })
    .from(instantlyEmails)
    .where(
      and(eq(instantlyEmails.id, ref.id), eq(instantlyEmails.orgId, orgId)),
    )
    .limit(1);

  if (!row) throw new Error("Nachricht nicht gefunden.");
  return { html: row.bodyHtml, text: row.bodyText };
}
