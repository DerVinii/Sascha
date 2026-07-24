"use server";

import {
  deleteMessage,
  getMessage,
  listFolders,
  listMessages,
  moveMessage,
  setFlagged,
  setSeen,
} from "@/lib/server/mailbox/imap";
import { sendMail, type OutgoingAttachment } from "@/lib/server/mailbox/smtp";
import type {
  MailboxFolder,
  MailboxListItem,
  MailboxMessage,
} from "@/lib/mailbox-ui";

// Bewusst KEIN revalidatePath in diesen Actions: die Client-Komponente hält
// ihren Zustand selbst aktuell (optimistische Updates + gezieltes Nachladen).
// revalidatePath würde bei jedem Klick die komplette Seite serverseitig neu
// rendern — inklusive erneutem Ordner- und Inbox-Abruf über IMAP.

export async function listFoldersAction(): Promise<MailboxFolder[]> {
  return listFolders();
}

export async function listMessagesAction(input: {
  folder: string;
  offset?: number;
  search?: string;
}): Promise<{ items: MailboxListItem[]; total: number }> {
  return listMessages(input.folder, {
    offset: input.offset,
    search: input.search,
  });
}

export async function openMessageAction(input: {
  folder: string;
  uid: number;
}): Promise<MailboxMessage> {
  return getMessage(input.folder, input.uid);
}

export async function setSeenAction(input: {
  folder: string;
  uid: number;
  seen: boolean;
}): Promise<void> {
  await setSeen(input.folder, input.uid, input.seen);
}

export async function toggleFlagAction(input: {
  folder: string;
  uid: number;
  flagged: boolean;
}): Promise<void> {
  await setFlagged(input.folder, input.uid, input.flagged);
}

export async function moveMessageAction(input: {
  folder: string;
  uid: number;
  target: string;
}): Promise<void> {
  await moveMessage(input.folder, input.uid, input.target);
}

export async function deleteMessageAction(input: {
  folder: string;
  uid: number;
}): Promise<void> {
  await deleteMessage(input.folder, input.uid);
}

/** Plain-Text → schlichtes, escaptes HTML (wie in der Unibox). */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div>${escaped.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Senden (Verfassen / Antworten / Weiterleiten). Nimmt FormData entgegen,
 * damit Datei-Anhänge direkt mitgeschickt werden können.
 */
export async function sendMailAction(formData: FormData): Promise<void> {
  const to = String(formData.get("to") ?? "").trim();
  const cc = String(formData.get("cc") ?? "").trim();
  const bcc = String(formData.get("bcc") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const inReplyTo = String(formData.get("inReplyTo") ?? "").trim() || null;
  const referencesRaw = String(formData.get("references") ?? "").trim();
  const references = referencesRaw ? referencesRaw.split(/\s+/) : null;

  if (!to) throw new Error("Empfänger fehlt.");
  if (!subject && !body.trim()) throw new Error("Betreff und Text sind leer.");

  const attachments: OutgoingAttachment[] = [];
  for (const file of formData.getAll("files")) {
    if (file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({
        filename: file.name,
        content: buf,
        contentType: file.type || undefined,
      });
    }
  }

  await sendMail({
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: subject || "(kein Betreff)",
    text: body,
    html: textToHtml(body),
    inReplyTo,
    references,
    attachments: attachments.length ? attachments : undefined,
  });
}
