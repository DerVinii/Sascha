/**
 * IMAP-Zugriff auf das echte Postfach (Webador). Serverless-tauglich:
 * pro Aufruf verbinden → Operation → trennen. Kein DB-Spiegel, alles live.
 *
 * Nur serverseitig importieren (liest die Zugangsdaten aus config.ts).
 */

import { ImapFlow, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { requireMailboxConfig } from "./config";
import type {
  MailAddress,
  MailAttachment,
  MailboxFolder,
  MailboxListItem,
  MailboxMessage,
} from "@/lib/mailbox-ui";

const PAGE_SIZE = 30;

/** Öffnet eine IMAP-Verbindung, führt `fn` aus und trennt sicher wieder. */
export async function withImap<T>(fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const cfg = requireMailboxConfig();
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    // Port 993 = implizites TLS; 143 = STARTTLS (imapflow handelt das automatisch).
    secure: cfg.imapPort === 993,
    auth: { user: cfg.email, pass: cfg.password },
    logger: false,
    emitLogs: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* Verbindung war schon zu — egal */
    }
  }
}

function mapAddr(list: unknown): MailAddress[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => {
      const addr = (a as { address?: string }).address ?? "";
      const name = (a as { name?: string }).name ?? "";
      return { name: name || null, address: addr };
    })
    .filter((a) => a.address);
}

function firstAddr(list: unknown): MailAddress | null {
  return mapAddr(list)[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function structureHasAttachment(node: any): boolean {
  if (!node) return false;
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some(structureHasAttachment);
  }
  const disp = (node.disposition ?? "").toString().toLowerCase();
  return disp === "attachment";
}

function toIso(d: unknown): string {
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapListItem(msg: any): MailboxListItem {
  const env = msg.envelope ?? {};
  return {
    uid: msg.uid,
    subject: env.subject ?? null,
    from: firstAddr(env.from),
    to: mapAddr(env.to),
    date: toIso(env.date ?? msg.internalDate),
    seen: msg.flags?.has("\\Seen") ?? false,
    flagged: msg.flags?.has("\\Flagged") ?? false,
    answered: msg.flags?.has("\\Answered") ?? false,
    hasAttachments: structureHasAttachment(msg.bodyStructure),
  };
}

function specialUseOf(f: ListResponse): string | null {
  if (f.specialUse) return f.specialUse;
  if (f.path.toUpperCase() === "INBOX") return "\\Inbox";
  return null;
}

export async function listFolders(): Promise<MailboxFolder[]> {
  return withImap(async (c) => {
    const list = await c.list();
    const out: MailboxFolder[] = [];
    for (const f of list) {
      if (f.flags?.has("\\Noselect")) continue;
      let total = 0;
      let unread = 0;
      try {
        const st = await c.status(f.path, { messages: true, unseen: true });
        total = st.messages ?? 0;
        unread = st.unseen ?? 0;
      } catch {
        /* manche Ordner lassen sich nicht statusen — mit 0 anzeigen */
      }
      out.push({
        path: f.path,
        name: f.name,
        specialUse: specialUseOf(f),
        total,
        unread,
      });
    }
    return out;
  });
}

const QUERY = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  bodyStructure: true,
};

export async function listMessages(
  folder: string,
  opts: { offset?: number; search?: string } = {},
): Promise<{ items: MailboxListItem[]; total: number }> {
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim();
  return withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (search) {
        const found = await c.search(
          {
            or: [
              { subject: search },
              { from: search },
              { to: search },
              { body: search },
            ],
          },
          { uid: true },
        );
        const uids = (Array.isArray(found) ? found : []).slice().reverse();
        const page = uids.slice(offset, offset + PAGE_SIZE);
        if (page.length === 0) return { items: [], total: uids.length };
        const items: MailboxListItem[] = [];
        for await (const msg of c.fetch(page.join(","), QUERY, { uid: true })) {
          items.push(mapListItem(msg));
        }
        items.sort((a, b) => b.uid - a.uid);
        return { items, total: uids.length };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mailbox = c.mailbox as any;
      const total: number = mailbox?.exists ?? 0;
      if (total === 0) return { items: [], total: 0 };
      const end = total - offset;
      if (end < 1) return { items: [], total };
      const start = Math.max(1, end - PAGE_SIZE + 1);
      const items: MailboxListItem[] = [];
      for await (const msg of c.fetch(`${start}:${end}`, QUERY)) {
        items.push(mapListItem(msg));
      }
      items.sort((a, b) => b.date.localeCompare(a.date));
      return { items, total };
    } finally {
      lock.release();
    }
  });
}

function addrObjToList(a: AddressObject | AddressObject[] | undefined): MailAddress[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: MailAddress[] = [];
  for (const obj of arr) {
    for (const v of obj.value ?? []) {
      if (v.address) out.push({ name: v.name || null, address: v.address });
    }
  }
  return out;
}

/** Eine Nachricht vollständig laden (Body + Anhänge) und als gelesen markieren. */
export async function getMessage(
  folder: string,
  uid: number,
): Promise<MailboxMessage> {
  return withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(
        String(uid),
        { uid: true, source: true, flags: true },
        { uid: true },
      );
      if (!msg || !msg.source) throw new Error("E-Mail nicht gefunden");
      const parsed = await simpleParser(msg.source);

      // Als gelesen markieren (best effort).
      try {
        await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch {
        /* egal */
      }

      const attachments: MailAttachment[] = (parsed.attachments ?? []).map(
        (att, index) => ({
          index,
          filename: att.filename || `anhang-${index + 1}`,
          contentType: att.contentType || "application/octet-stream",
          size: att.size ?? att.content?.length ?? 0,
        }),
      );
      // Inline-Bilder (im HTML per cid: referenziert) nicht als Anhang listen.
      const realAttachments = attachments.filter((_, i) => {
        const att = parsed.attachments?.[i];
        const disp = (att?.contentDisposition ?? "").toLowerCase();
        return disp === "attachment" || !att?.related;
      });

      const references = Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? [parsed.references]
          : [];

      return {
        uid,
        folder,
        subject: parsed.subject ?? null,
        from: addrObjToList(parsed.from)[0] ?? null,
        to: addrObjToList(parsed.to),
        cc: addrObjToList(parsed.cc),
        date: toIso(parsed.date),
        html: parsed.html || null,
        text: parsed.text || null,
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        references,
        attachments: realAttachments,
        seen: true,
        flagged: msg.flags?.has("\\Flagged") ?? false,
      };
    } finally {
      lock.release();
    }
  });
}

/** Einen Anhang als Buffer holen (für die Download-Route). */
export async function getAttachment(
  folder: string,
  uid: number,
  index: number,
): Promise<{ filename: string; contentType: string; content: Buffer }> {
  return withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(
        String(uid),
        { uid: true, source: true },
        { uid: true },
      );
      if (!msg || !msg.source) throw new Error("E-Mail nicht gefunden");
      const parsed = await simpleParser(msg.source);
      const att = parsed.attachments?.[index];
      if (!att) throw new Error("Anhang nicht gefunden");
      return {
        filename: att.filename || `anhang-${index + 1}`,
        contentType: att.contentType || "application/octet-stream",
        content: att.content,
      };
    } finally {
      lock.release();
    }
  });
}

export async function setSeen(
  folder: string,
  uid: number,
  seen: boolean,
): Promise<void> {
  await withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (seen) await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      else await c.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function setFlagged(
  folder: string,
  uid: number,
  flagged: boolean,
): Promise<void> {
  await withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (flagged)
        await c.messageFlagsAdd(String(uid), ["\\Flagged"], { uid: true });
      else await c.messageFlagsRemove(String(uid), ["\\Flagged"], { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function moveMessage(
  folder: string,
  uid: number,
  target: string,
): Promise<void> {
  await withImap(async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      await c.messageMove(String(uid), target, { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Löschen = in den Papierkorb verschieben (Outlook-Semantik). Ist die Mail
 * schon im Papierkorb, wird sie endgültig entfernt.
 */
export async function deleteMessage(
  folder: string,
  uid: number,
): Promise<void> {
  await withImap(async (c) => {
    const list = await c.list();
    const trash = list.find((f) => f.specialUse === "\\Trash");
    const inTrash =
      trash && trash.path === folder;
    const lock = await c.getMailboxLock(folder);
    try {
      if (!trash || inTrash) {
        await c.messageDelete(String(uid), { uid: true });
      } else {
        await c.messageMove(String(uid), trash.path, { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}

/** Eine gesendete Nachricht (rohes MIME) in den „Gesendet"-Ordner ablegen. */
export async function appendToSent(raw: Buffer): Promise<void> {
  await withImap(async (c) => {
    const list = await c.list();
    const sent =
      list.find((f) => f.specialUse === "\\Sent") ??
      list.find((f) => /^sent/i.test(f.name) || /gesendet/i.test(f.name));
    if (!sent) return;
    await c.append(sent.path, raw, ["\\Seen"]);
  });
}
