"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { htmlToPlainText } from "@/lib/signature";
import type {
  ContactMailHistory as History,
  ContactMailItem,
} from "@/lib/contact-mails";
import {
  getContactMailsAction,
  getContactMailBodyAction,
} from "@/app/(app)/crm/mail-actions";

/**
 * „Was wurde mit diesem Kontakt schon geschrieben?" — die Mails aus dem echten
 * Postfach und den Instantly-Kampagnen in einer Zeitleiste, ohne dass man sie
 * sich im Postfach zusammensuchen muss.
 *
 * Die Suche läuft live über IMAP und dauert je nach Postfachgröße ein paar
 * Sekunden. Deshalb wird das Ergebnis kurz zwischengespeichert: das Panel
 * mehrfach zu öffnen (oder zwischen Panel und Detailseite zu wechseln) kostet
 * dann keinen neuen Durchlauf.
 */

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: History }>();

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContactMailHistory({
  contactId,
  variant = "page",
}: {
  contactId: string;
  /** „drawer" = kompakte Überschrift im Kontakt-Panel. */
  variant?: "page" | "drawer";
}) {
  const [data, setData] = useState<History | null>(
    () => cache.get(contactId)?.data ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Verhindert, dass eine langsame Antwort einen inzwischen anderen Kontakt
  // überschreibt (Panel schnell weitergeklickt).
  const runRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const cached = cache.get(contactId);
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setData(cached.data);
        return;
      }
      const run = ++runRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await getContactMailsAction(contactId);
        cache.set(contactId, { at: Date.now(), data: res });
        if (run === runRef.current) setData(res);
      } catch (e) {
        if (run === runRef.current)
          setError(
            e instanceof Error
              ? e.message
              : "E-Mails konnten nicht geladen werden.",
          );
      } finally {
        if (run === runRef.current) setLoading(false);
      }
    },
    [contactId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const items = data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3
          className={cn(
            variant === "drawer"
              ? "text-[11px] font-semibold uppercase tracking-wide text-sub"
              : "text-sm font-semibold text-ink",
          )}
        >
          E-Mail-Verlauf
          {items.length > 0 && (
            <span className="ml-1.5 font-normal text-sub">({items.length})</span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          title="Neu laden"
          className="h-8 w-8 -my-1 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {data?.postfachError && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] text-sub">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px text-warn" />
          <span>
            Postfach nicht erreichbar ({data.postfachError}) — hier stehen nur
            die Kampagnenmails.
          </span>
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err">
          {error}
        </div>
      ) : loading && items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-sub py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          E-Mails werden gesucht …
        </p>
      ) : items.length === 0 ? (
        <EmptyHint addresses={data?.addresses ?? []} />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-lg overflow-hidden">
          {items.map((m) => (
            <MailRow key={m.id} item={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyHint({ addresses }: { addresses: string[] }) {
  if (addresses.length === 0) {
    return (
      <p className="text-sm text-sub py-3">
        Für diesen Kontakt ist keine E-Mail-Adresse hinterlegt — ohne Adresse
        lässt sich kein Verlauf finden.
      </p>
    );
  }
  return (
    <p className="text-sm text-sub py-3">
      Noch keine E-Mails mit {addresses.join(" oder ")} gefunden.
    </p>
  );
}

// --- Eine Nachricht ---------------------------------------------------------

function MailRow({ item }: { item: ContactMailItem }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<{
    html: string | null;
    text: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const incoming = item.direction === "in";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || body || loading) return;
    setLoading(true);
    setError(null);
    try {
      setBody(
        await getContactMailBodyAction(
          item.source === "postfach"
            ? {
                source: "postfach",
                folder: item.folder as string,
                uid: item.uid as number,
              }
            : { source: "kampagne", id: item.campaignMailId as string },
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Text konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  const herkunft =
    item.source === "kampagne"
      ? `Kampagne${item.campaignName ? ` „${item.campaignName}"` : ""}`
      : (item.folderLabel ?? "Postfach");

  return (
    <li className="bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left px-3 py-2.5 hover:bg-bg transition flex items-start gap-2.5"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 mt-1 shrink-0 text-sub transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 shrink-0",
                incoming ? "bg-info/10 text-info" : "bg-ok/10 text-ok",
              )}
            >
              {incoming ? "Eingang" : "Ausgang"}
            </span>
            <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">
              {item.subject || "(kein Betreff)"}
            </span>
            {item.hasAttachments && (
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-sub" />
            )}
            <span className="text-[11px] text-sub whitespace-nowrap">
              {formatWhen(item.date)}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-sub">
            <span className="pill bg-bg text-sub">{herkunft}</span>
            {item.counterpart && (
              <span className="truncate">
                {incoming ? "von" : "an"} {item.counterpart}
              </span>
            )}
          </span>
          {!open && item.preview && (
            <span className="mt-1 block text-xs text-sub line-clamp-2">
              {item.preview}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pl-8">
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-sub py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Text wird geladen …
            </p>
          ) : error ? (
            <p className="text-xs text-err py-2">{error}</p>
          ) : body ? (
            <MailBody html={body.html} text={body.text} />
          ) : null}
        </div>
      )}
    </li>
  );
}

/**
 * Text bevorzugt als Klartext rendern; nur reine HTML-Mails landen im
 * sandboxed iframe (keine Scripts, externe Bilder erst auf Klick — sonst
 * bestätigen Tracking-Pixel den Absendern das Öffnen).
 */
function MailBody({ html, text }: { html: string | null; text: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const [remote, setRemote] = useState(false);

  const plain = text?.trim() ? text : html ? htmlToPlainText(html) : "";

  if (!html || plain.trim()) {
    return (
      <div className="text-sm text-ink whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
        {plain || "(leer)"}
      </div>
    );
  }

  const hasRemote = /(?:src|href)\s*=\s*["']https?:/i.test(html);
  const csp = remote
    ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src https: data:"
    : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'";
  const doc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    body{font:13px/1.55 -apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;margin:8px;word-break:break-word}
    img{max-width:100%;height:auto} blockquote{border-left:3px solid #e2e8f0;margin:8px 0;padding-left:10px;color:#64748b}
  </style></head><body>${html}</body></html>`;

  return (
    <div className="overflow-x-auto">
      {hasRemote && !remote && (
        <button
          type="button"
          onClick={() => setRemote(true)}
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
            const el = ref.current?.contentDocument?.body;
            if (el) setHeight(Math.min(Math.max(el.scrollHeight + 20, 60), 500));
          } catch {
            // Cross-Origin-Randfälle: feste Höhe behalten
          }
        }}
      />
    </div>
  );
}
