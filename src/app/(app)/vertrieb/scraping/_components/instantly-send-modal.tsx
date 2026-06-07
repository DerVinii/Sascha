"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Send,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import type {
  InstantlyCampaign,
  InstantlySendPreview,
} from "@/lib/scraping-types";
import {
  listInstantlyCampaignsAction,
  previewInstantlySendAction,
  sendListToInstantlyAction,
} from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  /** wird nach erfolgreichem Versand aufgerufen (z. B. Tabelle neu laden). */
  onSent?: () => void;
};

type SendProgress = {
  sent: number;
  skipped: number;
  failed: number;
  processed: number;
};

export function InstantlySendModal({ open, onClose, listId, onSent }: Props) {
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");

  const [onlyEnriched, setOnlyEnriched] = useState(false);
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);

  const [preview, setPreview] = useState<InstantlySendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [done, setDone] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setCampaignsError(null);
    try {
      const res = await listInstantlyCampaignsAction();
      setCampaigns(res.campaigns);
      setCampaignsError(res.error);
      setCampaignId((prev) =>
        prev && res.campaigns.some((c) => c.id === prev)
          ? prev
          : res.campaigns[0]?.id ?? "",
      );
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  // Beim Öffnen: State zurücksetzen + Kampagnen laden.
  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setDone(false);
    setSendError(null);
    setPreview(null);
    loadCampaigns();
  }, [open, loadCampaigns]);

  // Vorschau live aktualisieren, wenn Kampagne/Filter wechseln.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewLoading(true);
    previewInstantlySendAction({
      listId,
      campaignId,
      filter: { onlyEnriched, skipAlreadySent },
    })
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, listId, campaignId, onlyEnriched, skipAlreadySent]);

  async function handleSend() {
    if (!campaignId || sending) return;
    setSending(true);
    setSendError(null);
    setDone(false);
    const acc: SendProgress = { sent: 0, skipped: 0, failed: 0, processed: 0 };
    setProgress({ ...acc });
    let offset = 0;
    try {
      // Sicherheits-Obergrenze gegen Endlosschleife.
      for (let i = 0; i < 10000; i++) {
        const r = await sendListToInstantlyAction({
          listId,
          campaignId,
          filter: { onlyEnriched, skipAlreadySent },
          offset,
        });
        if (r.error) {
          setSendError(r.error);
          break;
        }
        acc.sent += r.sent;
        acc.skipped +=
          r.skippedNoEmail + r.skippedNotEnriched + r.skippedAlreadySent;
        acc.failed += r.failed;
        acc.processed += r.processed;
        offset += r.processed;
        setProgress({ ...acc });
        if (r.remaining <= 0 || r.processed === 0) break;
      }
      setDone(true);
      onSent?.();
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const noCampaigns = !loadingCampaigns && campaigns.length === 0;
  const eligible = preview?.eligible ?? 0;
  const canSend = !!campaignId && eligible > 0 && !sending && !done;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Send className="h-4 w-4 text-info" />
            An Instantly senden
          </h3>
          <button
            onClick={onClose}
            disabled={sending}
            className="text-sub hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Kampagne */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sub">Kampagne</span>
              <button
                onClick={loadCampaigns}
                disabled={loadingCampaigns}
                className="text-[11px] text-info hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw
                  className={
                    loadingCampaigns ? "h-3 w-3 animate-spin" : "h-3 w-3"
                  }
                />
                Neu laden
              </button>
            </div>

            {loadingCampaigns ? (
              <div className="mt-1 flex items-center gap-2 text-sm text-sub">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Kampagnen
                laden …
              </div>
            ) : noCampaigns ? (
              <div className="mt-1 rounded-md border border-dashed border-line bg-bg p-3 text-xs text-sub">
                Keine Kampagne im Instantly-Workspace gefunden. Lege in{" "}
                <a
                  href="https://app.instantly.ai/app/campaigns"
                  target="_blank"
                  rel="noreferrer"
                  className="text-info hover:underline inline-flex items-center gap-0.5"
                >
                  Instantly <ExternalLink className="h-3 w-3" />
                </a>{" "}
                eine Kampagne an (Absender + E-Mail-Sequenz), dann erscheint sie
                hier.
                {campaignsError && (
                  <span className="mt-1 block text-err">{campaignsError}</span>
                )}
              </div>
            ) : (
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {campaignsError && !noCampaigns && (
              <p className="mt-1 text-[11px] text-err">{campaignsError}</p>
            )}
          </div>

          {/* Filter */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-sub">Welche Leads?</span>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={onlyEnriched}
                onChange={(e) => setOnlyEnriched(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line"
              />
              Nur mit gefundenem Entscheider (Enrichment erfolgreich)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={skipAlreadySent}
                onChange={(e) => setSkipAlreadySent(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line"
              />
              Bereits gesendete überspringen
            </label>
            <p className="text-[11px] text-sub">
              Leads ohne E-Mail werden immer übersprungen (Instantly braucht eine
              E-Mail-Adresse).
            </p>
          </div>

          {/* Vorschau */}
          <div className="rounded-lg border border-line bg-bg p-3">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-sub">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vorschau …
              </div>
            ) : preview ? (
              <div className="space-y-1">
                <div className="text-sm text-ink">
                  <span className="text-lg font-semibold text-info">
                    {eligible}
                  </span>{" "}
                  Leads werden gesendet
                </div>
                <div className="text-[11px] text-sub">
                  {preview.total} in Liste · {preview.withEmail} mit E-Mail ·{" "}
                  {preview.noEmail} ohne E-Mail · {preview.enriched} angereichert
                  {preview.alreadySent > 0 &&
                    ` · ${preview.alreadySent} bereits gesendet`}
                </div>
              </div>
            ) : (
              <div className="text-sm text-sub">Keine Vorschau verfügbar.</div>
            )}
          </div>

          {/* Versand-Status */}
          {progress && (
            <div
              className={
                done && !sendError
                  ? "rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm"
                  : "rounded-lg border border-line bg-bg p-3 text-sm"
              }
            >
              <div className="flex items-center gap-2 text-ink">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-info" />
                ) : sendError ? (
                  <AlertTriangle className="h-4 w-4 text-err" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-ok" />
                )}
                <span>
                  {progress.sent} gesendet · {progress.skipped} übersprungen
                  {progress.failed > 0 && ` · ${progress.failed} fehlgeschlagen`}
                </span>
              </div>
              {sendError && (
                <p className="mt-1 text-[11px] text-err">{sendError}</p>
              )}
              {done && !sendError && (
                <p className="mt-1 text-[11px] text-sub">
                  Fertig. Die Leads erscheinen in der gewählten Instantly-Kampagne.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-40"
          >
            {done ? "Schließen" : "Abbrechen"}
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending
              ? "Sende …"
              : eligible > 0
                ? `${eligible} senden`
                : "Senden"}
          </button>
        </div>
      </div>
    </div>
  );
}
