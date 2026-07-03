import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, instantlyEmails } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { maybeSyncInstantly } from "@/lib/server/instantly/sync";
import type { UniboxMessage } from "@/lib/instantly-ui";
import { UniboxView } from "./_components/unibox-view";

export const dynamic = "force-dynamic";

export default async function UniboxPage() {
  const org = await requireActiveOrg();

  // Backfill nur, wenn der letzte Sync älter als 2 min ist (20-req/min-Budget).
  let syncError: string | null = null;
  try {
    await maybeSyncInstantly(org.id);
  } catch (err) {
    syncError =
      err instanceof Error ? err.message : "Instantly-Sync fehlgeschlagen";
  }

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
    .where(eq(instantlyEmails.orgId, org.id))
    .orderBy(desc(instantlyEmails.timestampEmail))
    .limit(2000);

  const messages: UniboxMessage[] = rows.map((r) => ({
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
    contactName:
      [r.contactFirst, r.contactLast].filter(Boolean).join(" ").trim() || null,
  }));

  return <UniboxView initialMessages={messages} syncError={syncError} />;
}
