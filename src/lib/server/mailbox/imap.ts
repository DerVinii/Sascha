/**
 * IMAP-Zugriff auf das echte Postfach (Webador). Kein DB-Spiegel, alles live.
 *
 * Performance: Die Verbindung wird über einen kleinen Pool zwischen Requests
 * wiederverwendet (spart TLS-Handshake + Login ≈ 6–8 Roundtrips pro Aufruf).
 * Vor der Wiederverwendung wird sie per NOOP geprüft; ist sie tot oder gerade
 * belegt, wird transparent eine frische Verbindung geöffnet. Verhalten und
 * Semantik bleiben identisch zur Verbindung-pro-Request-Variante.
 *
 * Nur serverseitig importieren (liest die Zugangsdaten aus config.ts).
 */

import { ImapFlow, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { requireMailboxConfig, type MailboxConfig } from "./config";
import type {
  MailAddress,
  MailAttachment,
  MailboxFolder,
  MailboxListItem,
  MailboxMessage,
} from "@/lib/mailbox-ui";

const PAGE_SIZE = 30;

// --- Verbindungs-Pool --------------------------------------------------------

type Pooled = {
  client: ImapFlow;
  busy: boolean;
  lastUsed: number;
  connectedAt: number;
  key: string;
};

let pool: Pooled | null = null;

/** NOOP-Check nur, wenn die Verbindung länger als so viele ms unbenutzt war. */
const VERIFY_AFTER_MS = 10_000;
/** Verbindung vor einem möglichen Server-Autologout proaktiv recyceln. */
const MAX_AGE_MS = 20 * 60_000;

function poolKey(cfg: MailboxConfig): string {
  return `${cfg.email}@${cfg.imapHost}:${cfg.imapPort}`;
}

function closeQuiet(client: ImapFlow) {
  try {
    client.close();
  } catch {
    /* schon zu */
  }
}

async function verifyAlive(client: ImapFlow): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.noop(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("noop timeout")), 1500);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createClient(cfg: MailboxConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    // Port 993 = implizites TLS; 143 = STARTTLS (imapflow handelt das automatisch).
    secure: cfg.imapPort === 993,
    auth: { user: cfg.email, pass: cfg.password },
    logger: false,
    emitLogs: false,
  });
  // Fehler-/Close-Events dürfen den Prozess nicht crashen; toten Pool leeren.
  client.on("error", () => {
    if (pool?.client === client && !pool.busy) pool = null;
  });
  client.on("close", () => {
    if (pool?.client === client && !pool.busy) pool = null;
  });
  await client.connect();
  return client;
}

/**
 * Führt `fn` mit einer verbundenen IMAP-Session aus. Reihenfolge:
 * 1. gesunde Leerlauf-Verbindung aus dem Pool, sonst
 * 2. frische Verbindung (wird zum neuen Pool-Eintrag, wenn der Slot frei ist;
 *    parallel laufende Requests bekommen eine Wegwerf-Verbindung).
 */
export async function withImap<T>(fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const cfg = requireMailboxConfig();
  const key = poolKey(cfg);

  const p = pool;
  if (p && !p.busy && p.key === key) {
    p.busy = true;
    const aged = Date.now() - p.connectedAt > MAX_AGE_MS;
    const idle = Date.now() - p.lastUsed > VERIFY_AFTER_MS;
    const alive =
      !aged && p.client.usable && (!idle || (await verifyAlive(p.client)));
    if (alive) {
      try {
        return await fn(p.client);
      } finally {
        if (pool === p) {
          if (p.client.usable) {
            p.busy = false;
            p.lastUsed = Date.now();
          } else {
            pool = null;
            closeQuiet(p.client);
          }
        }
      }
    }
    // Verbindung ist tot/überaltert → verwerfen und unten frisch verbinden.
    if (pool === p) pool = null;
    closeQuiet(p.client);
  }

  const client = await createClient(cfg);
  const mine: Pooled = {
    client,
    busy: true,
    lastUsed: Date.now(),
    connectedAt: Date.now(),
    key,
  };
  const adopt = pool === null;
  if (adopt) pool = mine;
  try {
    return await fn(client);
  } finally {
    if (adopt && pool === mine) {
      if (client.usable) {
        mine.busy = false;
        mine.lastUsed = Date.now();
      } else {
        pool = null;
        closeQuiet(client);
      }
    } else if (!adopt) {
      // Wegwerf-Verbindung (Pool war belegt) sauber schließen.
      try {
        await client.logout();
      } catch {
        /* Verbindung war schon zu — egal */
      }
    }
  }
}

// --- Mapping-Helfer ----------------------------------------------------------

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

// --- Ordner ------------------------------------------------------------------

async function listFoldersOn(c: ImapFlow): Promise<MailboxFolder[]> {
  // LIST-STATUS liefert die Zähler aller Ordner in EINEM Roundtrip mit;
  // Fallback (Server ohne Extension): STATUS je Ordner wie früher.
  let list: ListResponse[];
  try {
    list = await c.list({ statusQuery: { messages: true, unseen: true } });
  } catch {
    list = await c.list();
  }
  const out: MailboxFolder[] = [];
  for (const f of list) {
    if (f.flags?.has("\\Noselect")) continue;
    let total = f.status?.messages ?? null;
    let unread = f.status?.unseen ?? null;
    if (total === null || unread === null) {
      try {
        const st = await c.status(f.path, { messages: true, unseen: true });
        total = st.messages ?? 0;
        unread = st.unseen ?? 0;
      } catch {
        total = total ?? 0;
        unread = unread ?? 0;
      }
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
}

export async function listFolders(): Promise<MailboxFolder[]> {
  return withImap(listFoldersOn);
}

// --- Nachrichtenliste --------------------------------------------------------

const QUERY = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  bodyStructure: true,
};

async function listMessagesOn(
  c: ImapFlow,
  folder: string,
  opts: { offset?: number; search?: string; flaggedOnly?: boolean } = {},
): Promise<{ items: MailboxListItem[]; total: number }> {
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim();
  const flaggedOnly = opts.flaggedOnly ?? false;
  const lock = await c.getMailboxLock(folder);
  try {
    if (search || flaggedOnly) {
      // Server-seitige Suche/Filter: liefert alle passenden UIDs im Ordner
      // (flagged UND Texttreffer, wenn beides aktiv), danach seitenweise laden.
      const criteria: {
        flagged?: boolean;
        or?: Array<{
          subject?: string;
          from?: string;
          to?: string;
          body?: string;
        }>;
      } = {};
      if (flaggedOnly) criteria.flagged = true;
      if (search)
        criteria.or = [
          { subject: search },
          { from: search },
          { to: search },
          { body: search },
        ];
      const found = await c.search(criteria, { uid: true });
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
}

export async function listMessages(
  folder: string,
  opts: { offset?: number; search?: string; flaggedOnly?: boolean } = {},
): Promise<{ items: MailboxListItem[]; total: number }> {
  return withImap((c) => listMessagesOn(c, folder, opts));
}

/**
 * Seitenladen von /postfach: Ordnerliste + erste Inbox-Seite in EINER
 * Verbindung (statt zwei getrennten Connects).
 */
export async function getMailboxOverview(): Promise<{
  folders: MailboxFolder[];
  inboxPath: string;
  list: { items: MailboxListItem[]; total: number };
}> {
  return withImap(async (c) => {
    const folders = await listFoldersOn(c);
    const inbox =
      folders.find((f) => f.specialUse === "\\Inbox") ?? folders[0] ?? null;
    const list = inbox
      ? await listMessagesOn(c, inbox.path, {})
      : { items: [], total: 0 };
    return { folders, inboxPath: inbox?.path ?? "INBOX", list };
  });
}

// --- Einzelne Nachricht ------------------------------------------------------

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

      // Als gelesen markieren (best effort) — nur wenn noch ungelesen.
      if (!msg.flags?.has("\\Seen")) {
        try {
          await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch {
          /* egal */
        }
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

// --- Flags / Verschieben / Löschen ------------------------------------------

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
    const inTrash = trash && trash.path === folder;
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
