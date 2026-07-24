"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Archive,
  Ban,
  Folder,
  Search,
  RefreshCw,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Paperclip,
  ChevronLeft,
  X,
  PenSquare,
  MailOpen,
  Mail,
  Download,
  Loader2,
} from "lucide-react";
import {
  addressListText,
  addressText,
  folderLabel,
  formatBytes,
  type MailboxFolder,
  type MailboxListItem,
  type MailboxMessage,
} from "@/lib/mailbox-ui";
import {
  deleteMessageAction,
  listMessagesAction,
  moveMessageAction,
  openMessageAction,
  sendMailAction,
  setSeenAction,
  toggleFlagAction,
} from "../mailbox-actions";

const PAGE_SIZE = 30;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function folderIcon(f: MailboxFolder) {
  switch (f.specialUse) {
    case "\\Inbox":
      return Inbox;
    case "\\Sent":
      return Send;
    case "\\Drafts":
      return FileEdit;
    case "\\Trash":
      return Trash2;
    case "\\Archive":
      return Archive;
    case "\\Junk":
      return Ban;
    default:
      return Folder;
  }
}

type ComposerState = {
  title: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string[] | null;
};

export function MailboxView({
  folders: initialFolders,
  initialFolder,
  initialList,
  senderEmail,
  initialComposeTo,
}: {
  folders: MailboxFolder[];
  initialFolder: string;
  initialList: { items: MailboxListItem[]; total: number };
  senderEmail: string;
  /** Aus dem Kontakt-Panel: Verfassen-Dialog direkt mit diesem Empfänger öffnen. */
  initialComposeTo?: string;
}) {
  const [folders, setFolders] = useState(initialFolders);
  const [activeFolder, setActiveFolder] = useState(initialFolder);
  const [items, setItems] = useState(initialList.items);
  const [total, setTotal] = useState(initialList.total);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [opened, setOpened] = useState<MailboxMessage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isListLoading, startList] = useTransition();
  const [isOpening, startOpen] = useTransition();
  const [isMoreLoading, startMore] = useTransition();

  const activeFolderObj = useMemo(
    () => folders.find((f) => f.path === activeFolder) ?? null,
    [folders, activeFolder],
  );

  // Aus dem Kontakt-Panel angesprungen (?compose=…): Verfassen-Dialog mit
  // vorausgefülltem Empfänger öffnen und den Parameter danach entfernen, damit
  // ein Reload den Dialog nicht erneut aufmacht. Das Strippen läuft bewusst
  // clientseitig über history.replaceState — router.replace würde die
  // force-dynamic-Seite neu rendern und einen zweiten (verworfenen) IMAP-Abruf
  // auslösen.
  const composedRef = useRef(false);
  useEffect(() => {
    if (initialComposeTo && !composedRef.current) {
      composedRef.current = true;
      setComposer({
        title: "Neue E-Mail",
        to: initialComposeTo,
        cc: "",
        bcc: "",
        subject: "",
        body: "",
        inReplyTo: null,
        references: null,
      });
      window.history.replaceState(window.history.state, "", "/postfach");
    }
  }, [initialComposeTo]);

  function bumpUnread(folderPath: string, delta: number) {
    setFolders((prev) =>
      prev.map((f) =>
        f.path === folderPath
          ? { ...f, unread: Math.max(0, f.unread + delta) }
          : f,
      ),
    );
  }

  function loadFolder(path: string, search = "") {
    setError(null);
    setActiveFolder(path);
    setSelectedUid(null);
    setOpened(null);
    setAppliedSearch(search);
    setSearchInput(search);
    startList(async () => {
      try {
        const res = await listMessagesAction({ folder: path, search });
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      }
    });
  }

  function refresh() {
    loadFolder(activeFolder, appliedSearch);
  }

  function runSearch() {
    loadFolder(activeFolder, searchInput.trim());
  }

  function loadMore() {
    startMore(async () => {
      try {
        const res = await listMessagesAction({
          folder: activeFolder,
          offset: items.length,
          search: appliedSearch || undefined,
        });
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.uid));
          return [...prev, ...res.items.filter((m) => !seen.has(m.uid))];
        });
        setTotal(res.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      }
    });
  }

  function openItem(item: MailboxListItem) {
    setSelectedUid(item.uid);
    setError(null);
    const wasUnread = !item.seen;
    if (wasUnread) {
      setItems((prev) =>
        prev.map((m) => (m.uid === item.uid ? { ...m, seen: true } : m)),
      );
      bumpUnread(activeFolder, -1);
    }
    startOpen(async () => {
      try {
        const msg = await openMessageAction({
          folder: activeFolder,
          uid: item.uid,
        });
        setOpened(msg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Öffnen fehlgeschlagen");
      }
    });
  }

  function markUnread(item: MailboxListItem) {
    setItems((prev) =>
      prev.map((m) => (m.uid === item.uid ? { ...m, seen: false } : m)),
    );
    bumpUnread(activeFolder, +1);
    setSeenAction({ folder: activeFolder, uid: item.uid, seen: false }).catch(
      () => refresh(),
    );
  }

  function toggleFlag(item: MailboxListItem) {
    const next = !item.flagged;
    setItems((prev) =>
      prev.map((m) => (m.uid === item.uid ? { ...m, flagged: next } : m)),
    );
    toggleFlagAction({
      folder: activeFolder,
      uid: item.uid,
      flagged: next,
    }).catch(() => refresh());
  }

  function removeFromList(uid: number) {
    setItems((prev) => prev.filter((m) => m.uid !== uid));
    setTotal((t) => Math.max(0, t - 1));
    if (selectedUid === uid) {
      setSelectedUid(null);
      setOpened(null);
    }
  }

  function del(uid: number) {
    const item = items.find((m) => m.uid === uid);
    removeFromList(uid);
    if (item && !item.seen) bumpUnread(activeFolder, -1);
    deleteMessageAction({ folder: activeFolder, uid }).catch(() => refresh());
  }

  function move(uid: number, target: string) {
    const item = items.find((m) => m.uid === uid);
    removeFromList(uid);
    if (item && !item.seen) bumpUnread(activeFolder, -1);
    moveMessageAction({ folder: activeFolder, uid, target }).catch(() =>
      refresh(),
    );
  }

  function quoted(msg: MailboxMessage): string {
    const header = [
      `Von: ${addressText(msg.from)}${msg.from ? ` <${msg.from.address}>` : ""}`,
      `Datum: ${formatFull(msg.date)}`,
      `Betreff: ${msg.subject ?? "(kein Betreff)"}`,
    ].join("\n");
    const original = (msg.text ?? "").trim();
    return `\n\n---------- Ursprüngliche Nachricht ----------\n${header}\n\n${original}`;
  }

  function reSubject(prefix: "Re" | "Fwd", subject: string | null): string {
    const s = (subject ?? "").trim();
    const re = new RegExp(`^${prefix}:`, "i");
    return re.test(s) ? s : `${prefix}: ${s || "(kein Betreff)"}`;
  }

  function openCompose() {
    setComposer({
      title: "Neue E-Mail",
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      inReplyTo: null,
      references: null,
    });
  }

  function openReply(msg: MailboxMessage, all: boolean) {
    const me = senderEmail.toLowerCase();
    const others = [...msg.to, ...msg.cc].filter(
      (a) =>
        a.address.toLowerCase() !== me &&
        a.address.toLowerCase() !== (msg.from?.address.toLowerCase() ?? ""),
    );
    setComposer({
      title: all ? "Allen antworten" : "Antworten",
      to: msg.from?.address ?? "",
      cc: all ? others.map((a) => a.address).join(", ") : "",
      bcc: "",
      subject: reSubject("Re", msg.subject),
      body: quoted(msg),
      inReplyTo: msg.messageId,
      references: [...msg.references, msg.messageId].filter(
        (r): r is string => Boolean(r),
      ),
    });
  }

  function openForward(msg: MailboxMessage) {
    setComposer({
      title: "Weiterleiten",
      to: "",
      cc: "",
      bcc: "",
      subject: reSubject("Fwd", msg.subject),
      body: quoted(msg),
      inReplyTo: null,
      references: null,
    });
  }

  const canLoadMore = items.length < total;

  return (
    <div className="p-3 md:p-6 h-full flex flex-col">
      {error && (
        <div className="mb-3 rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-err/70 hover:text-err"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex rounded-xl border border-line bg-surface overflow-hidden">
        {/* Ordner-Spalte (Desktop) */}
        <div className="hidden lg:flex w-52 shrink-0 border-r border-line flex-col">
          <div className="p-3 border-b border-line">
            <button
              onClick={openCompose}
              className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition"
            >
              <PenSquare className="h-4 w-4" />
              Neue E-Mail
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {folders.map((f) => {
              const Icon = folderIcon(f);
              const active = f.path === activeFolder;
              return (
                <button
                  key={f.path}
                  onClick={() => loadFolder(f.path)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition ${
                    active
                      ? "bg-accent-faint text-accent-ink font-medium"
                      : "text-sub hover:text-ink hover:bg-bg"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {folderLabel(f)}
                  </span>
                  {f.unread > 0 && (
                    <span className="shrink-0 text-[10px] font-semibold rounded-full bg-accent text-white px-1.5 py-0.5 min-w-[18px] text-center">
                      {f.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mittelspalte: Liste */}
        <div
          className={`${opened ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 shrink-0 border-r border-line flex-col`}
        >
          <div className="p-3 border-b border-line space-y-2">
            {/* Mobile: Ordner-Auswahl + Verfassen */}
            <div className="flex items-center gap-2 lg:hidden">
              <select
                value={activeFolder}
                onChange={(e) => loadFolder(e.target.value)}
                className="h-9 flex-1 min-w-0 rounded-md border border-line bg-bg px-2 text-sm text-ink focus:outline-none"
              >
                {folders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {folderLabel(f)}
                    {f.unread > 0 ? ` (${f.unread})` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={openCompose}
                title="Neue E-Mail"
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md bg-accent hover:bg-accent-hover text-white transition"
              >
                <PenSquare className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sub" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder={`In ${
                    activeFolderObj ? folderLabel(activeFolderObj) : "Ordner"
                  } suchen …`}
                  className="w-full h-9 sm:h-8 pl-8 pr-2 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>
              <button
                onClick={refresh}
                disabled={isListLoading}
                title="Aktualisieren"
                className="h-9 w-9 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md border border-line text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isListLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            {appliedSearch && (
              <button
                onClick={() => loadFolder(activeFolder, "")}
                className="text-[11px] text-accent hover:underline"
              >
                Suche „{appliedSearch}" zurücksetzen
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isListLoading && items.length === 0 ? (
              <div className="p-8 text-center text-sm text-sub">
                <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                Lade …
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="h-8 w-8 mx-auto mb-3 text-sub/50" />
                <p className="text-sm font-medium text-ink">
                  {appliedSearch ? "Keine Treffer" : "Keine E-Mails"}
                </p>
              </div>
            ) : (
              <>
                {items.map((item) => (
                  <button
                    key={item.uid}
                    onClick={() => openItem(item)}
                    className={`w-full text-left px-3 py-2.5 border-b border-line/60 transition ${
                      selectedUid === item.uid
                        ? "bg-accent-faint"
                        : "hover:bg-bg"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate ${
                          !item.seen
                            ? "font-semibold text-ink"
                            : "font-medium text-ink/90"
                        }`}
                      >
                        {activeFolderObj?.specialUse === "\\Sent"
                          ? addressListText(item.to) || "(kein Empfänger)"
                          : addressText(item.from)}
                      </span>
                      <span className="text-[10px] text-sub whitespace-nowrap shrink-0">
                        {formatTime(item.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {!item.seen && (
                        <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                      )}
                      {item.flagged && (
                        <Star className="h-3 w-3 text-warn fill-warn shrink-0" />
                      )}
                      <span className="text-xs text-sub truncate">
                        {item.subject || "(kein Betreff)"}
                      </span>
                      {item.hasAttachments && (
                        <Paperclip className="h-3 w-3 text-sub/70 shrink-0 ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
                {canLoadMore && (
                  <div className="p-3 text-center">
                    <button
                      onClick={loadMore}
                      disabled={isMoreLoading}
                      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
                    >
                      {isMoreLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Mehr laden ({items.length}/{total})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Lesebereich */}
        <div
          className={`${opened ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}
        >
          {!opened ? (
            <div className="flex-1 flex items-center justify-center text-sub text-sm">
              <div className="text-center">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {isOpening ? "Lade …" : "Wähle links eine E-Mail aus."}
              </div>
            </div>
          ) : (
            <Reader
              msg={opened}
              folders={folders}
              activeFolder={activeFolder}
              onBack={() => {
                setOpened(null);
                setSelectedUid(null);
              }}
              onReply={() => openReply(opened, false)}
              onReplyAll={() => openReply(opened, true)}
              onForward={() => openForward(opened)}
              onDelete={() => del(opened.uid)}
              onMove={(target) => move(opened.uid, target)}
              onMarkUnread={() => {
                const item = items.find((m) => m.uid === opened.uid);
                if (item) markUnread(item);
                setOpened(null);
                setSelectedUid(null);
              }}
              onToggleFlag={() => {
                const item = items.find((m) => m.uid === opened.uid);
                if (item) toggleFlag(item);
              }}
              flagged={
                items.find((m) => m.uid === opened.uid)?.flagged ?? opened.flagged
              }
            />
          )}
        </div>
      </div>

      {composer && (
        <Composer
          state={composer}
          senderEmail={senderEmail}
          onClose={() => setComposer(null)}
          onSent={() => {
            setComposer(null);
            refresh();
          }}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  );
}

function Reader({
  msg,
  folders,
  activeFolder,
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onMove,
  onMarkUnread,
  onToggleFlag,
  flagged,
}: {
  msg: MailboxMessage;
  folders: MailboxFolder[];
  activeFolder: string;
  onBack: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onMarkUnread: () => void;
  onToggleFlag: () => void;
  flagged: boolean;
}) {
  return (
    <>
      <div className="px-3 sm:px-4 py-2.5 border-b border-line flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onBack}
          className="md:hidden h-9 w-9 -ml-1 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
          aria-label="Zurück"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <ToolbarButton icon={Reply} label="Antworten" onClick={onReply} />
        <ToolbarButton icon={ReplyAll} label="Allen" onClick={onReplyAll} />
        <ToolbarButton icon={Forward} label="Weiterleiten" onClick={onForward} />
        <div className="w-px h-5 bg-line mx-0.5" />
        <ToolbarButton
          icon={Star}
          label={flagged ? "Markiert" : "Markieren"}
          onClick={onToggleFlag}
          active={flagged}
        />
        <ToolbarButton icon={MailOpen} label="Ungelesen" onClick={onMarkUnread} />
        <MoveMenu
          folders={folders}
          activeFolder={activeFolder}
          onMove={onMove}
        />
        <ToolbarButton icon={Trash2} label="Löschen" onClick={onDelete} danger />
      </div>

      <div className="px-4 sm:px-6 py-3 border-b border-line">
        <h1 className="text-base font-semibold text-ink break-words">
          {msg.subject || "(kein Betreff)"}
        </h1>
        <div className="mt-1.5 text-xs text-sub space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink">{addressText(msg.from)}</span>
            {msg.from && (
              <span className="text-sub/80">&lt;{msg.from.address}&gt;</span>
            )}
            <span className="ml-auto">{formatFull(msg.date)}</span>
          </div>
          {msg.to.length > 0 && (
            <div className="truncate">An: {addressListText(msg.to)}</div>
          )}
          {msg.cc.length > 0 && (
            <div className="truncate">Cc: {addressListText(msg.cc)}</div>
          )}
        </div>
        {msg.attachments.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {msg.attachments.map((att) => (
              <a
                key={att.index}
                href={`/api/postfach/attachment?folder=${encodeURIComponent(
                  msg.folder,
                )}&uid=${msg.uid}&index=${att.index}`}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs text-ink hover:bg-surface transition max-w-full"
                download
              >
                <Paperclip className="h-3.5 w-3.5 text-sub shrink-0" />
                <span className="truncate">{att.filename}</span>
                <span className="text-sub/70 shrink-0">
                  {formatBytes(att.size)}
                </span>
                <Download className="h-3.5 w-3.5 text-sub shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-bg/40 p-3 sm:p-4">
        <MessageBody html={msg.html} text={msg.text} />
      </div>
    </>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`h-8 px-2 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition ${
        danger
          ? "text-sub hover:text-err hover:bg-err/5"
          : active
            ? "text-accent-ink bg-accent-faint"
            : "text-sub hover:text-ink hover:bg-bg"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function MoveMenu({
  folders,
  activeFolder,
  onMove,
}: {
  folders: MailboxFolder[];
  activeFolder: string;
  onMove: (target: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const targets = folders.filter((f) => f.path !== activeFolder);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title="Verschieben"
        className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-sub hover:text-ink hover:bg-bg transition"
      >
        <Folder className="h-4 w-4" />
        <span className="hidden xl:inline">Verschieben</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 max-h-72 overflow-y-auto rounded-md border border-line bg-surface shadow-lg py-1">
          {targets.map((f) => (
            <button
              key={f.path}
              onMouseDown={() => onMove(f.path)}
              className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-bg transition truncate"
            >
              {folderLabel(f)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({
  state,
  senderEmail,
  onClose,
  onSent,
  onError,
}: {
  state: ComposerState;
  senderEmail: string;
  onClose: () => void;
  onSent: () => void;
  onError: (msg: string) => void;
}) {
  const [to, setTo] = useState(state.to);
  const [cc, setCc] = useState(state.cc);
  const [bcc, setBcc] = useState(state.bcc);
  const [showCc, setShowCc] = useState(Boolean(state.cc || state.bcc));
  const [subject, setSubject] = useState(state.subject);
  const [body, setBody] = useState(state.body);
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, startSend] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!to.trim()) {
      onError("Bitte einen Empfänger angeben.");
      return;
    }
    startSend(async () => {
      try {
        const fd = new FormData();
        fd.set("to", to);
        fd.set("cc", cc);
        fd.set("bcc", bcc);
        fd.set("subject", subject);
        fd.set("body", body);
        if (state.inReplyTo) fd.set("inReplyTo", state.inReplyTo);
        if (state.references) fd.set("references", state.references.join(" "));
        for (const f of files) fd.append("files", f);
        await sendMailAction(fd);
        onSent();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-surface sm:rounded-xl border border-line shadow-xl flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">{state.title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-[11px] text-sub">
            Von: <span className="text-ink">{senderEmail}</span>
          </div>
          <Field label="An">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="empfaenger@beispiel.de"
              className="w-full bg-transparent text-sm text-ink placeholder:text-sub focus:outline-none"
            />
          </Field>
          {!showCc ? (
            <button
              onClick={() => setShowCc(true)}
              className="text-[11px] text-accent hover:underline"
            >
              Cc/Bcc hinzufügen
            </button>
          ) : (
            <>
              <Field label="Cc">
                <input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="w-full bg-transparent text-sm text-ink focus:outline-none"
                />
              </Field>
              <Field label="Bcc">
                <input
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="w-full bg-transparent text-sm text-ink focus:outline-none"
                />
              </Field>
            </>
          )}
          <Field label="Betreff">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-transparent text-sm text-ink focus:outline-none"
            />
          </Field>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder="Nachricht schreiben …"
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub resize-y focus:outline-none focus:ring-1 focus:ring-accent/40"
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink"
                >
                  <Paperclip className="h-3 w-3 text-sub" />
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <button
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-sub hover:text-err"
                    aria-label="Entfernen"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-line">
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...list]);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-ink hover:bg-bg transition"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Anhang
            </button>
          </div>
          <button
            onClick={submit}
            disabled={isSending || !to.trim()}
            className="h-9 px-5 inline-flex items-center gap-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSending ? "Sendet …" : "Senden"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line py-1.5">
      <span className="text-[11px] font-medium text-sub w-12 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * HTML-Mails sandboxed im iframe rendern (keine Scripts). Externe Ressourcen
 * (Tracking-Pixel) erst nach Klick laden — wie in der Unibox.
 */
function MessageBody({
  html,
  text,
}: {
  html: string | null;
  text: string | null;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const [remoteContent, setRemoteContent] = useState(false);

  if (!html) {
    return (
      <div className="text-sm text-ink whitespace-pre-wrap break-words max-w-3xl">
        {text || "(leer)"}
      </div>
    );
  }

  const hasRemote = /(?:src|href)\s*=\s*["']https?:/i.test(html);
  const csp = remoteContent
    ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:"
    : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'";
  const doc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    body{font:14px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;margin:10px;word-break:break-word}
    img{max-width:100%;height:auto} blockquote{border-left:3px solid #e2e8f0;margin:8px 0;padding-left:10px;color:#64748b}
    a{color:#2563eb}
  </style></head><body>${html}</body></html>`;

  return (
    <div className="max-w-3xl">
      {hasRemote && !remoteContent && (
        <button
          type="button"
          onClick={() => setRemoteContent(true)}
          className="mb-2 inline-flex items-center min-h-[36px] py-1.5 text-[11px] text-sub underline hover:text-ink"
        >
          Externe Bilder laden
        </button>
      )}
      <iframe
        ref={ref}
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="w-full rounded bg-white"
        style={{ height, border: 0 }}
        onLoad={() => {
          try {
            const body = ref.current?.contentDocument?.body;
            if (body) {
              setHeight(Math.min(Math.max(body.scrollHeight + 24, 120), 4000));
            }
          } catch {
            /* Randfälle: feste Höhe behalten */
          }
        }}
      />
    </div>
  );
}
