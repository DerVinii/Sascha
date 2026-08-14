"use server";

import { requireActiveOrg } from "@/lib/server/active-org";
import {
  getContactMailBody,
  getContactMailHistory,
} from "@/lib/server/contact-mails";
import type {
  ContactMailBody,
  ContactMailBodyRef,
  ContactMailHistory,
} from "@/lib/contact-mails";

/**
 * E-Mail-Verlauf eines Kontakts (Postfach + Kampagnenmails). Bewusst als eigene
 * Action neben `getContactDetailAction`: die IMAP-Suche läuft live gegen den
 * Mailserver und soll das Öffnen des Kontakt-Panels nicht ausbremsen.
 */
export async function getContactMailsAction(
  contactId: string,
): Promise<ContactMailHistory> {
  const org = await requireActiveOrg();
  return getContactMailHistory(org.id, contactId);
}

/** Text einer einzelnen Nachricht des Verlaufs nachladen. */
export async function getContactMailBodyAction(
  ref: ContactMailBodyRef,
): Promise<ContactMailBody> {
  const org = await requireActiveOrg();
  return getContactMailBody(org.id, ref);
}
