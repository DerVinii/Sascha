/**
 * Geteilte Typen + Helfer für das echte E-Mail-Postfach (Webador, IMAP/SMTP).
 *
 * Diese Datei enthält KEINE Server-Imports (imapflow etc.) und darf daher
 * sowohl aus Server-Actions als auch aus Client-Komponenten importiert werden.
 */

export type MailAddress = { name: string | null; address: string };

/** Ein Ordner im Postfach (IMAP-Mailbox). */
export type MailboxFolder = {
  path: string; // IMAP-Pfad, z. B. "INBOX", "Sent"
  name: string; // Anzeigename des Ordners aus dem Server
  /** Sonder-Rolle: \Inbox \Sent \Drafts \Junk \Trash \Archive (oder null). */
  specialUse: string | null;
  unread: number;
  total: number;
};

/** Ein Listeneintrag (Kopfzeile) in der Ordner-Ansicht — ohne Body. */
export type MailboxListItem = {
  uid: number;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  date: string; // ISO
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
};

export type MailAttachment = {
  index: number; // Position in der geparsten Attachment-Liste (für den Download)
  filename: string;
  contentType: string;
  size: number;
};

/** Eine vollständig geladene Nachricht (Lesebereich). */
export type MailboxMessage = {
  uid: number;
  folder: string;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  date: string; // ISO
  html: string | null;
  text: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: MailAttachment[];
  seen: boolean;
  flagged: boolean;
};

/** Inhalt eines Entwurfs, zum Weiterbearbeiten in den Composer geladen. */
export type DraftContent = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** Editor-HTML (Fragment, Bilder als data:-URI inline). */
  bodyHtml: string;
  inReplyTo: string | null;
  references: string[];
  attachments: { filename: string; contentType: string; base64: string }[];
};

// --- Anzeige-Helfer ----------------------------------------------------------

/** Ist dieser Ordner der Entwürfe-Ordner? (Sonderrolle oder Name.) */
export function isDraftsFolder(
  folder: { specialUse: string | null; name: string } | null | undefined,
): boolean {
  if (!folder) return false;
  if (folder.specialUse === "\\Drafts") return true;
  const key = folder.name.trim().toLowerCase();
  return key === "drafts" || key === "entwürfe" || key === "entwurfe";
}

const SPECIAL_LABELS: Record<string, string> = {
  "\\Inbox": "Posteingang",
  "\\Sent": "Gesendet",
  "\\Drafts": "Entwürfe",
  "\\Junk": "Spam",
  "\\Trash": "Papierkorb",
  "\\Archive": "Archiv",
};

const NAME_LABELS: Record<string, string> = {
  inbox: "Posteingang",
  sent: "Gesendet",
  "sent items": "Gesendet",
  drafts: "Entwürfe",
  entwürfe: "Entwürfe",
  junk: "Spam",
  spam: "Spam",
  trash: "Papierkorb",
  "deleted items": "Papierkorb",
  archive: "Archiv",
};

/** Deutscher Anzeigename für einen Ordner (Sonderrolle > Namens-Mapping > Name). */
export function folderLabel(folder: {
  specialUse: string | null;
  name: string;
  path: string;
}): string {
  if (folder.specialUse && SPECIAL_LABELS[folder.specialUse])
    return SPECIAL_LABELS[folder.specialUse];
  const key = folder.name.trim().toLowerCase();
  return NAME_LABELS[key] ?? folder.name;
}

/** Reihenfolge der Ordner: Posteingang zuerst, dann Standardordner, dann Rest. */
export function folderSortRank(folder: {
  specialUse: string | null;
  path: string;
}): number {
  const order = ["\\Inbox", "\\Sent", "\\Drafts", "\\Archive", "\\Junk", "\\Trash"];
  const idx = folder.specialUse ? order.indexOf(folder.specialUse) : -1;
  if (folder.path.toUpperCase() === "INBOX") return 0;
  return idx === -1 ? 100 : idx;
}

/** Einen Absender/Empfänger als Text darstellen. */
export function addressText(a: MailAddress | null): string {
  if (!a) return "(unbekannt)";
  if (a.name && a.name.trim()) return a.name.trim();
  return a.address;
}

export function addressListText(list: MailAddress[]): string {
  return list.map(addressText).join(", ");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
