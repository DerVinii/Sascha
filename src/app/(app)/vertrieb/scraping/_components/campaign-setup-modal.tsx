"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Mail,
} from "lucide-react";
import type {
  CampaignStep,
  CampaignSenderAccount,
  InstantlySendPreview,
} from "@/lib/scraping-types";
import {
  getCampaignSetupAction,
  previewInstantlySendAction,
  saveCampaignAction,
  sendListToInstantlyAction,
} from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  onDone?: () => void;
};

type RunProgress = { sent: number; skipped: number; failed: number };

export function CampaignSetupModal({
  open,
  onClose,
  listId,
  listName,
  onDone,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [onlyEnriched, setOnlyEnriched] = useState(false);
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [preview, setPreview] = useState<InstantlySendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [steps, setSteps] = useState<CampaignStep[]>([
    { subject: "", body: "", delayDays: 0 },
  ]);
  const [accounts, setAccounts] = useState<CampaignSenderAccount[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [activate, setActivate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [done, setDone] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setSetupError(null);
    try {
      const info = await getCampaignSetupAction({ listId });
      setCampaignId(info.campaignId);
      setSteps(
        info.steps.length ? info.steps : [{ subject: "", body: "", delayDays: 0 }],
      );
      setAccounts(info.accounts);
      setSenders(info.accounts.filter((a) => a.active).map((a) => a.email));
      setPreview(info.preview);
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setProgress(null);
    setDone(false);
    setRunError(null);
    setActivate(false);
    loadSetup();
  }, [open, loadSetup]);

  // Vorschau live bei Filterwechsel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewLoading(true);
    previewInstantlySendAction({
      listId,
      filter: { onlyEnriched, skipAlreadySent },
    })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => {})
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, listId, onlyEnriched, skipAlreadySent]);

  function updateStep(i: number, patch: Partial<CampaignStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addFollowup() {
    setSteps((prev) => [...prev, { subject: "", body: "", delayDays: 3 }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function toggleSender(email: string) {
    setSenders((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  }

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    setRunError(null);
    setDone(false);
    try {
      const saved = await saveCampaignAction({
        listId,
        steps,
        senders,
        activate,
      });
      if (saved.error) {
        setRunError(saved.error);
        return;
      }
      setCampaignId(saved.campaignId);

      // Leads in Chargen senden.
      const acc: RunProgress = { sent: 0, skipped: 0, failed: 0 };
      setProgress({ ...acc });
      let offset = 0;
      for (let i = 0; i < 10000; i++) {
        const r = await sendListToInstantlyAction({
          listId,
          filter: { onlyEnriched, skipAlreadySent },
          offset,
        });
        if (r.error) {
          setRunError(r.error);
          break;
        }
        acc.sent += r.sent;
        acc.skipped +=
          r.skippedNoEmail + r.skippedNotEnriched + r.skippedAlreadySent;
        acc.failed += r.failed;
        offset += r.processed;
        setProgress({ ...acc });
        if (r.remaining <= 0 || r.processed === 0) break;
      }
      setDone(true);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const eligible = preview?.eligible ?? 0;
  const firstMailFilled =
    steps[0] && (steps[0].subject.trim() || steps[0].body.trim());
  const activeSenders = accounts.filter((a) => a.active);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
              <Send className="h-4 w-4 text-info" />
              Kampagne einrichten
            </h3>
            <p className="text-[11px] text-sub mt-0.5">
              {listName} · Schritt {step} von 2 ·{" "}
              {step === 1 ? "Leads auswählen" : "Copy schreiben"}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sub hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {setupError && (
            <div className="rounded-md bg-err/10 px-3 py-2 text-sm text-err">
              {setupError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-sub py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Kampagne …
            </div>
          ) : step === 1 ? (
            /* ---------- Schritt 1: Leads ---------- */
            <>
              <div className="space-y-2">
                <span className="text-xs font-medium text-sub">
                  Welche Leads sollen in die Kampagne?
                </span>
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
                  Leads ohne E-Mail werden immer übersprungen.
                </p>
              </div>

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
                      {preview.total} in Kampagne · {preview.withEmail} mit E-Mail
                      · {preview.noEmail} ohne · {preview.enriched} angereichert
                      {preview.alreadySent > 0 &&
                        ` · ${preview.alreadySent} bereits gesendet`}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-sub">Keine Vorschau.</div>
                )}
              </div>
            </>
          ) : (
            /* ---------- Schritt 2: Copy ---------- */
            <>
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-line bg-bg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-info" />
                        {i === 0 ? "Erste E-Mail" : `Follow-up ${i}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {i > 0 && (
                          <label className="text-[11px] text-sub inline-flex items-center gap-1">
                            Verzögerung
                            <input
                              type="number"
                              min={1}
                              value={s.delayDays}
                              onChange={(e) =>
                                updateStep(i, {
                                  delayDays: Number(e.target.value),
                                })
                              }
                              className="h-6 w-14 px-1.5 rounded border border-line bg-surface text-ink text-xs focus:outline-none"
                            />
                            Tage
                          </label>
                        )}
                        {steps.length > 1 && (
                          <button
                            onClick={() => removeStep(i)}
                            className="text-sub hover:text-err"
                            title="Schritt entfernen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      placeholder="Betreff"
                      className="w-full h-9 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
                    />
                    <textarea
                      value={s.body}
                      onChange={(e) => updateStep(i, { body: e.target.value })}
                      placeholder="Text der E-Mail …"
                      rows={5}
                      className="w-full px-3 py-2 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30 resize-y"
                    />
                  </div>
                ))}

                <button
                  onClick={addFollowup}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Follow-up hinzufügen
                </button>

                <p className="text-[11px] text-sub">
                  Platzhalter: <code>{"{{first_name}}"}</code>,{" "}
                  <code>{"{{last_name}}"}</code>,{" "}
                  <code>{"{{company_name}}"}</code> werden pro Lead ersetzt.
                </p>
              </div>

              {/* Absender */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-sub">
                  Absender-Postfächer
                </span>
                {activeSenders.length === 0 ? (
                  <p className="text-[11px] text-warn">
                    Keine aktiven Absender im Workspace — die Kampagne kann ohne
                    Absender (noch) nicht versenden.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeSenders.map((a) => (
                      <label
                        key={a.email}
                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-line bg-bg text-xs text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={senders.includes(a.email)}
                          onChange={() => toggleSender(a.email)}
                          className="h-3 w-3 rounded border-line"
                        />
                        {a.email}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Aktivieren */}
              <label className="flex items-start gap-2 text-sm text-ink rounded-lg border border-line bg-bg p-3">
                <input
                  type="checkbox"
                  checked={activate}
                  onChange={(e) => setActivate(e.target.checked)}
                  className="h-3.5 w-3.5 mt-0.5 rounded border-line"
                />
                <span>
                  Kampagne sofort aktivieren
                  <span className="block text-[11px] text-warn">
                    Startet den echten Mailversand. Ohne Haken wird nur die Copy
                    gespeichert und die Leads eingespielt — Start dann in Instantly.
                  </span>
                </span>
              </label>
            </>
          )}

          {/* Lauf-Status */}
          {progress && (
            <div
              className={
                done && !runError
                  ? "rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm"
                  : "rounded-lg border border-line bg-bg p-3 text-sm"
              }
            >
              <div className="flex items-center gap-2 text-ink">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-info" />
                ) : runError ? (
                  <AlertTriangle className="h-4 w-4 text-err" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-ok" />
                )}
                <span>
                  {progress.sent} gesendet · {progress.skipped} übersprungen
                  {progress.failed > 0 && ` · ${progress.failed} fehlgeschlagen`}
                </span>
              </div>
              {runError && <p className="mt-1 text-[11px] text-err">{runError}</p>}
              {done && !runError && (
                <p className="mt-1 text-[11px] text-sub">
                  Fertig.{" "}
                  {activate
                    ? "Kampagne ist aktiv — der Versand läuft."
                    : "Copy gespeichert & Leads eingespielt. Aktivieren kannst du in Instantly."}
                </p>
              )}
            </div>
          )}
          {runError && !progress && (
            <p className="text-sm text-err">{runError}</p>
          )}
        </div>

        {/* Footer-Navigation */}
        <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-2">
          <div>
            {step === 2 && !done && (
              <button
                onClick={() => setStep(1)}
                disabled={busy}
                className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Zurück
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-40"
            >
              {done ? "Schließen" : "Abbrechen"}
            </button>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={loading}
                className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
              >
                Weiter
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              !done && (
                <button
                  onClick={handleSubmit}
                  disabled={busy || !firstMailFilled}
                  className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {busy
                    ? "Richte ein …"
                    : `Einrichten & ${eligible} senden`}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
