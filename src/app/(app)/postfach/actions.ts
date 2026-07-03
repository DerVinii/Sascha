"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, instantlyEmails } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  markThreadAsRead,
  pauseAccount,
  replyToEmail,
  resumeAccount,
  updateLeadInterestStatus,
} from "@/lib/server/instantly/client";
import {
  syncInstantlyEmails,
  syncThread,
  upsertInstantlyEmails,
} from "@/lib/server/instantly/sync";
import type { UniboxMessage } from "@/lib/instantly-ui";

function contactName(
  first: string | null,
  last: string | null,
): string | null {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || null;
}

async function threadMessages(
  orgId: string,
  threadId: string,
): Promise<UniboxMessage[]> {
  const rows = await db
    .select({
      id: instantlyEmails.id,
      threadId: instantlyEmails.threadId,
      campaignId: instantlyEmails.campaignId,
      campaignName: instantlyEmails.campaignName,
      eaccount: instantlyEmails.eaccount,
      leadEmail: instantlyEmails.leadEmail,
      direction: instantlyEmails.direction,
      subject: instantlyEmails.subject,
      bodyHtml: instantlyEmails.bodyHtml,
      bodyText: instantlyEmails.bodyText,
      contentPreview: instantlyEmails.contentPreview,
      isUnread: instantlyEmails.isUnread,
      iStatus: instantlyEmails.iStatus,
      timestampEmail: instantlyEmails.timestampEmail,
      contactId: instantlyEmails.contactId,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(instantlyEmails)
    .leftJoin(contacts, eq(instantlyEmails.contactId, contacts.id))
    .where(
      and(
        eq(instantlyEmails.orgId, orgId),
        eq(instantlyEmails.threadId, threadId),
      ),
    )
    .orderBy(asc(instantlyEmails.timestampEmail));
  return rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    eaccount: r.eaccount,
    leadEmail: r.leadEmail,
    direction: r.direction,
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    contentPreview: r.contentPreview,
    isUnread: r.isUnread,
    iStatus: r.iStatus,
    timestampEmail: r.timestampEmail.toISOString(),
    contactId: r.contactId,
    contactName: contactName(r.contactFirst, r.contactLast),
  }));
}

/** Manueller Backfill („Aktualisieren"-Button). */
export async function refreshUniboxAction(): Promise<void> {
  const org = await requireActiveOrg();
  await syncInstantlyEmails(org.id);
  revalidatePath("/postfach/unibox");
}

/**
 * Thread öffnen: live von Instantly nachladen (holt auch gesendete Mails)
 * und alle Nachrichten des Threads zurückgeben.
 */
export async function loadThreadAction(
  threadId: string,
): Promise<UniboxMessage[]> {
  const org = await requireActiveOrg();
  try {
    await syncThread(org.id, threadId);
  } catch {
    // API down/Rate-Limit → zeig, was lokal gespiegelt ist
  }
  return threadMessages(org.id, threadId);
}

/** Antwort senden — immer auf die letzte empfangene Mail des Threads. */
export async function sendReplyAction(input: {
  emailId: string;
  body: string;
}): Promise<UniboxMessage | null> {
  const org = await requireActiveOrg();
  const text = input.body.trim();
  if (!text) throw new Error("Leere Nachricht");

  const [row] = await db
    .select()
    .from(instantlyEmails)
    .where(
      and(
        eq(instantlyEmails.id, input.emailId),
        eq(instantlyEmails.orgId, org.id),
      ),
    )
    .limit(1);
  if (!row) throw new Error("E-Mail nicht gefunden");
  if (!row.eaccount) throw new Error("Kein Absender-Account am Thread");

  const subject = row.subject?.trim()
    ? /^re:/i.test(row.subject.trim())
      ? row.subject.trim()
      : `Re: ${row.subject.trim()}`
    : "Re:";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = `<div>${escaped.replace(/\n/g, "<br>")}</div>`;

  const sent = await replyToEmail({
    replyToUuid: row.id,
    eaccount: row.eaccount,
    subject,
    bodyHtml: html,
    bodyText: text,
  });
  await upsertInstantlyEmails(org.id, [sent]);
  revalidatePath("/postfach/unibox");

  if (row.threadId) {
    const msgs = await threadMessages(org.id, row.threadId);
    return msgs.find((m) => m.id === sent.id) ?? null;
  }
  return null;
}

/** Einzelne Mail ohne Thread-Id als gelesen markieren (nur lokaler Spiegel). */
export async function markEmailReadAction(emailId: string): Promise<void> {
  const org = await requireActiveOrg();
  await db
    .update(instantlyEmails)
    .set({ isUnread: false })
    .where(
      and(eq(instantlyEmails.orgId, org.id), eq(instantlyEmails.id, emailId)),
    );
  revalidatePath("/postfach/unibox");
}

/** Thread als gelesen markieren (Instantly + lokaler Spiegel). */
export async function markThreadReadAction(threadId: string): Promise<void> {
  const org = await requireActiveOrg();
  try {
    await markThreadAsRead(threadId);
  } catch {
    // lokal trotzdem als gelesen markieren
  }
  await db
    .update(instantlyEmails)
    .set({ isUnread: false })
    .where(
      and(
        eq(instantlyEmails.orgId, org.id),
        eq(instantlyEmails.threadId, threadId),
      ),
    );
  revalidatePath("/postfach/unibox");
}

/** Lead-Interest-Status setzen (läuft bei Instantly asynchron). */
export async function setLeadInterestAction(input: {
  leadEmail: string;
  interestValue: number | null;
  campaignId?: string | null;
}): Promise<void> {
  const org = await requireActiveOrg();
  await updateLeadInterestStatus(input);
  // Optimistischer lokaler Spiegel (Instantly aktualisiert asynchron).
  await db
    .update(instantlyEmails)
    .set({ iStatus: input.interestValue })
    .where(
      and(
        eq(instantlyEmails.orgId, org.id),
        eq(instantlyEmails.leadEmail, input.leadEmail),
      ),
    );
  revalidatePath("/postfach/unibox");
}

export async function pauseAccountAction(email: string): Promise<void> {
  await requireActiveOrg();
  await pauseAccount(email);
  revalidatePath("/postfach/accounts");
}

export async function resumeAccountAction(email: string): Promise<void> {
  await requireActiveOrg();
  await resumeAccount(email);
  revalidatePath("/postfach/accounts");
}
