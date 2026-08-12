"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Inbox,
  RefreshCw,
  Search,
  Send,
  User,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import {
  INTEREST_OPTIONS,
  interestLabel,
  type UniboxMessage,
} from "@/lib/instantly-ui";
import { htmlToPlainText } from "@/lib/signature";
import {
  loadThreadAction,
  markEmailReadAction,
  markThreadReadAction,
  refreshUniboxAction,
  sendReplyAction,
  setLeadInterestAction,
} from "../../actions";

type Thread = {
  key: string; // threadId oder E-Mail-id als Fallback
  threadId: string | null;
  latest: UniboxMessage;
  latestIncoming: UniboxMessage | null;
  unreadCount: number;
  messages: UniboxMessage[];
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function buildThreads(messages: UniboxMessage[]): Thread[] {
  const map = new Map<string, UniboxMessage[]>();
  for (const m of messages) {
    const key = m.threadId ?? m.id;
    const arr = map.get(key);
    if (arr) arr.push(m);
    else map.set(key, [m]);
  }
  const threads: Thread[] = [];
  for (const [key, msgs] of map) {
    const sorted = [...msgs].sort((a, b) =>
      a.timestampEmail.localeCompare(b.timestampEmail),
    );
    const latest = sorted[sorted.length - 1];
    const incoming = sorted.filter((m) => m.direction === "in");
    threads.push({
      key,
      threadId: latest.threadId,
      latest,
      latestIncoming: incoming[incoming.length - 1] ?? null,
      unreadCount: sorted.filter((m) => m.isUnread && m.direction === "in")
        .length,
      messages: sorted,
    });
  }
  threads.sort((a, b) =>
    b.latest.timestampEmail.localeCompare(a.latest.timestampEmail),
  );
  return threads;
}

export function UniboxView({
  initialMessages,
  syncError,
}: {
  initialMessages: UniboxMessage[];
  syncError: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const [isLoadingThread, startLoadThread] = useTransition();
  const [isSending, startSend] = useTransition();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const threads = useMemo(() => buildThreads(messages), [messages]);

  const campaigns = useMemo(() => {
    const set = new Map<string, string>();
    for (const m of messages) {
      if (m.campaignId) set.set(m.campaignId, m.campaignName ?? "(ohne Namen)");
    }
    return [...set.entries()];
  }, [messages]);

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (unreadOnly && t.unreadCount === 0) return false;
      if (campaignFilter && t.latest.campaignId !== campaignFilter)
        return false;
      if (!q) return true;
      const hay = [
        t.latest.leadEmail,
        t.latest.contactName,
        t.latest.subject,
        t.latest.contentPreview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [threads, search, unreadOnly, campaignFilter]);

  const selected = useMemo(
    () => threads.find((t) => t.key === selectedKey) ?? null,
    [threads, selectedKey],
  );

  function mergeMessages(incoming: UniboxMessage[]) {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()];
    });
  }

  function selectThread(t: Thread) {
    setSelectedKey(t.key);
    setReplyText("");
    setError(null);
    const wasUnread = t.unreadCount > 0;

    if (wasUnread) {
      // Optimistisch als gelesen markieren
      setMessages((prev) =>
        prev.map((m) =>
          (m.threadId ?? m.id) === t.key ? { ...m, isUnread: false } : m,
        ),
      );
      if (t.threadId) {
        markThreadReadAction(t.threadId).catch(() => router.refresh());
      } else {
        markEmailReadAction(t.latest.id).catch(() => router.refresh());
      }
    }

    if (t.threadId) {
      const threadId = t.threadId;
      // Live nachladen (holt auch unsere gesendeten Mails in den Spiegel).
      // isUnread wird beim Merge erzwungen, sonst überschreibt der noch
      // ungelesene Instantly-Stand den optimistischen Read-State (Flackern).
      startLoadThread(async () => {
        try {
          const msgs = await loadThreadAction(threadId);
          if (msgs.length > 0) {
            mergeMessages(
              wasUnread ? msgs.map((m) => ({ ...m, isUnread: false })) : msgs,
            );
          }
        } catch {
          // lokaler Stand reicht als Fallback
        }
      });
    }
  }

  function handleRefresh() {
    setError(null);
    startRefresh(async () => {
      try {
        await refreshUniboxAction();
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Aktualisieren fehlgeschlagen",
        );
      }
    });
  }

  function handleSend() {
    if (!selected?.latestIncoming || !replyText.trim() || isSending) return;
    const target = selected.latestIncoming;
    const body = replyText;
    setError(null);
    startSend(async () => {
      try {
        const sent = await sendReplyAction({ emailId: target.id, body });
        if (sent) mergeMessages([sent]);
        setReplyText("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Senden fehlgeschlagen",
        );
      }
    });
  }

  function handleInterest(value: number | null) {
    if (!selected?.latest.leadEmail) return;
    const leadEmail = selected.latest.leadEmail;
    const campaignId = selected.latest.campaignId;
    // Optimistisch
    setMessages((prev) =>
      prev.map((m) =>
        m.leadEmail === leadEmail ? { ...m, iStatus: value } : m,
      ),
    );
    setLeadInterestAction({ leadEmail, interestValue: value, campaignId }).catch(
      () => router.refresh(),
    );
  }

  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      {(syncError || error) && (
        <div className="mb-3 rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err">
          {error ?? `Instantly-Sync: ${syncError}`}
        </div>
      )}

      <div className="flex-1 min-h-0 flex rounded-xl border border-line bg-surface overflow-hidden">
        {/* Thread-Liste — auf Mobile Master-Detail: Liste ODER Konversation */}
        <div
          className={`${selected ? "hidden sm:flex" : "flex"} w-full sm:w-80 md:w-96 shrink-0 border-r border-line flex-col`}
        >
          <div className="p-3 border-b border-line space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sub" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen …"
                  className="w-full h-10 sm:h-8 pl-8 pr-2 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Aktualisieren"
                className="h-10 w-10 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md border border-line text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUnreadOnly((v) => !v)}
                className={`h-10 sm:h-7 px-3 sm:px-2.5 rounded-md text-xs font-medium border transition ${
                  unreadOnly
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line text-sub hover:text-ink"
                }`}
              >
                Ungelesen{totalUnread > 0 ? ` (${totalUnread})` : ""}
              </button>
              {campaigns.length > 0 && (
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="h-10 sm:h-7 flex-1 min-w-0 rounded-md border border-line bg-bg px-1.5 text-xs text-ink focus:outline-none"
                >
                  <option value="">Alle Kampagnen</option>
                  {campaigns.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visibleThreads.length === 0 ? (
              <EmptyState
                hasAny={threads.length > 0}
                onRefresh={handleRefresh}
                refreshing={isRefreshing}
              />
            ) : (
              visibleThreads.map((t) => (
                <button
                  key={t.key}
                  onClick={() => selectThread(t)}
                  className={`w-full text-left px-3 py-2.5 border-b border-line/60 transition ${
                    selectedKey === t.key
                      ? "bg-accent-faint"
                      : "hover:bg-bg"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${
                        t.unreadCount > 0
                          ? "font-semibold text-ink"
                          : "font-medium text-ink/90"
                      }`}
                    >
                      {t.latest.contactName ||
                        t.latest.leadEmail ||
                        "(unbekannt)"}
                    </span>
                    <span className="text-[10px] text-sub whitespace-nowrap">
                      {formatTime(t.latest.timestampEmail)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {t.unreadCount > 0 && (
                      <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                    )}
                    <span className="text-xs text-sub truncate">
                      {t.latest.subject || "(kein Betreff)"}
                    </span>
                  </div>
                  <div className="text-[11px] text-sub/80 truncate mt-0.5">
                    {t.latest.contentPreview ||
                      t.latest.bodyText?.slice(0, 90) ||
                      ""}
                  </div>
                  {t.latest.campaignName && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-bg border border-line text-sub truncate max-w-full">
                      {t.latest.campaignName}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Konversation */}
        <div
          className={`${selected ? "flex" : "hidden"} sm:flex flex-1 min-w-0 flex-col`}
        >
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sub text-sm">
              <div className="text-center">
                <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Wähle links eine Konversation aus.
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <button
                  onClick={() => setSelectedKey(null)}
                  className="sm:hidden h-10 w-10 -ml-1 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
                  aria-label="Zurück zur Liste"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink truncate">
                    {selected.latest.contactName ||
                      selected.latest.leadEmail ||
                      "(unbekannt)"}
                  </div>
                  <div className="text-xs text-sub truncate">
                    {selected.latest.leadEmail}
                    {selected.latest.eaccount
                      ? ` · über ${selected.latest.eaccount}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selected.latest.leadEmail && (
                    <div className="relative">
                      <select
                        value={String(
                          (selected.latestIncoming ?? selected.latest)
                            .iStatus ?? "null",
                        )}
                        onChange={(e) =>
                          handleInterest(
                            e.target.value === "null"
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        className="h-10 sm:h-8 appearance-none rounded-md border border-line bg-bg pl-2.5 pr-7 text-xs font-medium text-ink focus:outline-none"
                        title={interestLabel(
                          (selected.latestIncoming ?? selected.latest).iStatus,
                        )}
                      >
                        {INTEREST_OPTIONS.map((o) => (
                          <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sub" />
                    </div>
                  )}
                  {selected.latest.contactId && (
                    <Link
                      href={`/crm/${selected.latest.contactId}`}
                      className="h-10 sm:h-8 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-sub hover:text-ink hover:bg-bg transition"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Im CRM öffnen</span><span className="md:hidden">CRM</span>
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-bg/40">
                {isLoadingThread && selected.messages.length === 0 && (
                  <div className="text-xs text-sub text-center">Lade …</div>
                )}
                {selected.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>

              <div className="border-t border-line p-3">
                {selected.latestIncoming ? (
                  /* Absender-Zeile und Senden-Knopf stehen ÜBER dem Feld —
                     daneben bliebe dem Textfeld auf dem Handy nur ein
                     schmaler Rest, in dem man ständig scrollen müsste. */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-sub">
                        Antworten als{" "}
                        {selected.latestIncoming.eaccount ?? "…"}
                      </span>
                      <button
                        onClick={handleSend}
                        disabled={isSending || !replyText.trim()}
                        className="h-9 shrink-0 px-4 inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isSending ? "Sendet …" : "Senden"}
                      </button>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Deine Antwort …"
                      rows={3}
                      className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-sub resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-sub">
                    In diesem Thread gibt es noch keine empfangene Mail — eine
                    Antwort ist erst möglich, wenn der Lead geantwortet hat.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  hasAny,
  onRefresh,
  refreshing,
}: {
  hasAny: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="p-8 text-center">
      <Inbox className="h-8 w-8 mx-auto mb-3 text-sub/50" />
      <p className="text-sm font-medium text-ink">
        {hasAny ? "Keine Treffer" : "Noch keine Antworten"}
      </p>
      <p className="text-xs text-sub mt-1 max-w-xs mx-auto">
        {hasAny
          ? "Passe Suche oder Filter an."
          : "Sobald deine Instantly-Kampagnen laufen und Leads antworten, landen die Konversationen hier."}
      </p>
      {!hasAny && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="mt-3 h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Jetzt aktualisieren
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UniboxMessage }) {
  const incoming = message.direction === "in";
  return (
    <div className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-xl border px-3.5 py-2.5 ${
          incoming
            ? "bg-surface border-line"
            : "bg-accent-faint border-accent-line"
        }`}
      >
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-[11px] font-medium text-sub truncate">
            {incoming
              ? message.leadEmail || "Lead"
              : message.eaccount || "Gesendet"}
          </span>
          <span className="text-[10px] text-sub whitespace-nowrap">
            {new Date(message.timestampEmail).toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {message.subject && (
          <div className="text-xs font-semibold text-ink mb-1 truncate">
            {message.subject}
          </div>
        )}
        {/* Immer den Klartext auf der dunklen Bubble rendern (Lead links, eigene
            Antworten rechts) — kein weißer HTML-iframe-Kasten. Fällt nur auf den
            iframe zurück, wenn eine Mail gar keinen Textteil hat. */}
        <MessageBody
          html={message.bodyHtml}
          text={message.bodyText}
          preferText
        />
      </div>
    </div>
  );
}

/**
 * HTML-Mails sandboxed im iframe rendern: keine Scripts (sandbox ohne
 * allow-scripts), Links öffnen in neuem Tab. allow-same-origin ist nötig,
 * damit wir die Höhe auslesen können — ohne allow-scripts bleibt das sicher.
 */
function MessageBody({
  html,
  text,
  preferText = false,
}: {
  html: string | null;
  text: string | null;
  /** Vorhandenen Klartext bevorzugen (eigene Antworten wie Lead-Mails rendern). */
  preferText?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  const [remoteContent, setRemoteContent] = useState(false);

  // Text-Darstellung: vorhandenen Klartext nutzen, sonst aus dem HTML ableiten
  // (Instantly liefert bei gesendeten Antworten oft nur HTML zurück).
  const plain =
    text && text.trim()
      ? text
      : html
        ? htmlToPlainText(html)
        : "";

  // Kein HTML — oder bewusst der Klartext (Lead & eigene Antworten): direkt auf
  // der dunklen Bubble rendern statt im weißen iframe-Kasten.
  if (!html || (preferText && plain.trim())) {
    return (
      <div className="text-sm text-ink whitespace-pre-wrap break-words">
        {plain || "(leer)"}
      </div>
    );
  }

  // Externe Ressourcen (Tracking-Pixel!) standardmäßig per CSP blocken —
  // wie Outlook: Bilder erst nach Klick auf „Externe Bilder laden".
  const hasRemote = /(?:src|href)\s*=\s*["']https?:/i.test(html);
  const csp = remoteContent
    ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:"
    : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'";
  const doc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    body{font:13px/1.55 -apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;margin:8px;word-break:break-word}
    img{max-width:100%;height:auto} blockquote{border-left:3px solid #e2e8f0;margin:8px 0;padding-left:10px;color:#64748b}
  </style></head><body>${html}</body></html>`;

  return (
    // overflow-x-auto: HTML-Mails mit fester Breite scrollen im Kasten, statt
    // die Blase über den Bildschirmrand hinaus zu schieben.
    <div className="overflow-x-auto scroll-sichtbar">
      {hasRemote && !remoteContent && (
        <button
          type="button"
          onClick={() => setRemoteContent(true)}
          className="mb-1.5 inline-flex items-center min-h-[36px] py-1.5 -my-1.5 text-[11px] text-sub underline hover:text-ink"
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
              setHeight(Math.min(Math.max(body.scrollHeight + 20, 60), 700));
            }
          } catch {
            // Cross-Origin-Randfälle: feste Höhe behalten
          }
        }}
      />
    </div>
  );
}
