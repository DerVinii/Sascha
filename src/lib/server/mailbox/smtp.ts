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

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const cfg = requireMailboxConfig();

  const common = {
    from: cfg.email,
    to: mail.to,
    cc: mail.cc || undefined,
    bcc: mail.bcc || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    inReplyTo: mail.inReplyTo || undefined,
    references: mail.references?.length ? mail.references.join(" ") : undefined,
    attachments: mail.attachments,
  };

  // 1) MIME einmal bauen (Stream-Transport, gepuffert) — für Versand UND Ablage.
  const builder = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "crlf",
  });
  const built = await builder.sendMail(common);
  const raw = (built as unknown as { message: Buffer }).message;

  // 2) Über SMTP versenden (vorgefertigtes MIME).
  const smtp = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: cfg.email, pass: cfg.password },
  });
  await smtp.sendMail({ envelope: built.envelope, raw });

  // 3) Kopie in „Gesendet" ablegen (Fehler hier dürfen den Versand nicht kippen).
  try {
    await appendToSent(raw);
  } catch {
    /* best effort */
  }
}
