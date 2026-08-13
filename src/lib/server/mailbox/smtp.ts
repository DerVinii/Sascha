/**
 * SMTP-Versand für das echte Postfach (Webador). Baut das MIME einmal, sendet
 * es über SMTP und legt eine Kopie im „Gesendet"-Ordner ab (best effort).
 *
 * Nur serverseitig importieren.
 */

import nodemailer from "nodemailer";
import { requireMailboxConfig } from "./config";
import { appendToSent } from "./imap";

export type OutgoingAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /**
   * Gesetzt für eingebettete Bilder (Signatur): im HTML als `cid:…`
   * referenziert. Nodemailer baut daraus automatisch ein multipart/related,
   * damit das Bild beim Empfänger im Text steht statt als Anhang.
   */
  cid?: string;
  contentDisposition?: "inline" | "attachment";
};

export type OutgoingMail = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[] | null;
  attachments?: OutgoingAttachment[];
};

/**
 * MIME einmal bauen (Stream-Transport, gepuffert). Dasselbe Rohformat dient dem
 * Versand, der „Gesendet"-Ablage UND den Entwürfen. `messageId` wird als
 * Fallback zurückgegeben, um einen frisch angehängten Entwurf auf Servern ohne
 * UIDPLUS über die Message-ID wiederzufinden.
 */
export async function buildOutgoingMime(mail: OutgoingMail) {
  const cfg = requireMailboxConfig();
  const builder = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "crlf",
  });
  const built = await builder.sendMail({
    from: cfg.email,
    // Entwürfe dürfen (noch) ohne Empfänger sein — dann bleibt der To-Header weg.
    to: mail.to || undefined,
    cc: mail.cc || undefined,
    bcc: mail.bcc || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references?.length ? mail.references.join(" ") : undefined,
    attachments: mail.attachments,
  });
  return {
    raw: (built as unknown as { message: Buffer }).message,
    envelope: built.envelope,
    messageId: built.messageId,
  };
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const cfg = requireMailboxConfig();

  // 1) MIME bauen — dasselbe Rohformat für Versand UND „Gesendet"-Ablage.
  const { raw, envelope } = await buildOutgoingMime(mail);

  // 2) Über SMTP versenden (vorgefertigtes MIME).
  const smtp = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: cfg.email, pass: cfg.password },
  });
  await smtp.sendMail({ envelope, raw });

  // 3) Kopie in „Gesendet" ablegen (Fehler hier dürfen den Versand nicht kippen).
  try {
    await appendToSent(raw);
  } catch {
    /* best effort */
  }
}
