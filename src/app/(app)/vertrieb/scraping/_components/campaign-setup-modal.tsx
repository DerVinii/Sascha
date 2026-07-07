"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { instantlyVarToken } from "@/lib/scraping-types";
import type {
  CampaignStep,
  InstantlySendPreview,
  LeadColumn,
} from "@/lib/scraping-types";
import {
  getCampaignSetupAction,
  previewInstantlySendAction,
  saveCampaignAction,
  sendListToInstantlyAction,
  setInstantlyCampaignLiveAction,
} from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  listName: string;
  columns: LeadColumn[];
  /** true = Kampagne existiert bereits → "bearbeiten" statt "einrichten". */
  hasCampaign?: boolean;
  onDone?: () => void;
};

type RunProgress = {
  sent: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  skippedNotEnriched: number;
  skippedDuplicate: number;
};

export function CampaignSetupModal({
  open,
  onClose,
  listId,
  listName,
  columns,
  hasCampaign = false,
  onDone,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);

  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [onlyEnriched, setOnlyEnriched] = useState(false);
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  // Duplikate aus ANDEREN Kampagnen überspringen (gleiche Kampagne: immer dedupliziert).
  const [skipWorkspaceDuplicates, setSkipWorkspaceDuplicates] = useState(false);
  const [preview, setPreview] = useState<InstantlySendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [steps, setSteps] = useState<CampaignStep[]>([
    { subject: "", body: "", delayDays: 0 },
  ]);
  // Absender werden ohne UI automatisch gesetzt: alle aktiven Postfächer.
  const [senders, setSenders] = useState<string[]>([]);
  // Live/Draft-Umschalter. Standard: Live. Bei bestehender Kampagne aus dem Status.
  const [live, setLive] = useState(true);
  const [finalLive, setFinalLive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [done, setDone] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Variablen-Einfügen: zuletzt fokussiertes Copy-Feld merken + Refs auf alle Felder.
  const fieldRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});
  const lastFocused = useRef<{ i: number; field: "subject" | "body" } | null>(
    null,
  );
  const varBtnRef = useRef<HTMLButtonElement | null>(null);
  const [varMenuOpen, setVarMenuOpen] = useState(false);
  const [varMenuPos, setVarMenuPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setSetupError(null);
    try {
      const info = await getCampaignSetupAction({ listId });
      setCampaignId(info.campaignId);
      setSteps(
        info.steps.length ? info.steps : [{ subject: "", body: "", delayDays: 0 }],
      );
      setSenders(info.accounts.filter((a) => a.active).map((a) => a.email));
      setPreview(info.preview);
      // Bestehende Kampagne: Toggle spiegelt echten Status (1 = live). Neu: Live.
      setLive(info.campaignId ? info.status === 1 : true);
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
    setLive(true);
    setFinalLive(false);
    loadSetup();
  }, [open, loadSetup]);

  // Vorschau live bei Filterwechsel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewLoading(true);
    previewInstantlySendAction({
      listId,
      filter: { onlyEnriched, skipAlreadySent, skipWorkspaceDuplicates },
    })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => {})
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, listId, onlyEnriched, skipAlreadySent, skipWorkspaceDuplicates]);

  function updateStep(i: number, patch: Partial<CampaignStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addFollowup() {
    setSteps((prev) => [...prev, { subject: "", body: "", delayDays: 3 }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function openVarMenu() {
    const r = varBtnRef.current?.getBoundingClientRect();
    if (r) setVarMenuPos({ left: r.left, top: r.bottom + 4 });
    setVarMenuOpen((v) => !v);
  }

  /** Fügt {{token}} an der Cursor-Position des zuletzt fokussierten Felds ein. */
  function insertVariable(token: string) {
    const lf = lastFocused.current;
    let i = lf ? lf.i : 0;
    const field: "subject" | "body" = lf ? lf.field : "body";
    if (!steps[i]) i = 0;
    const key = `${i}:${field}`;
    const el = fieldRefs.current[key];
    const variable = `{{${token}}}`;
    const cur = steps[i]?.[field] ?? "";
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? start;
    const next = cur.slice(0, start) + variable + cur.slice(end);
    updateStep(i, field === "subject" ? { subject: next } : { body: next });
    const pos = start + variable.length;
    requestAnimationFrame(() => {
      const e2 = fieldRefs.current[key];
      if (e2) {
        e2.focus();
        try {
          e2.setSelectionRange(pos, pos);
        } catch {
          /* number/range nicht setzbar – ignorieren */
        }
      }
    });
    setVarMenuOpen(false);
  }

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    setRunError(null);
    setDone(false);
    setFinalLive(false);
    try {
      // 1) Copy + Absender + Schedule (8–16 Berlin) speichern — noch nicht live.
      const saved = await saveCampaignAction({
        listId,
        steps,
        senders,
        activate: false,
      });
      if (saved.error) {
        setRunError(saved.error);
        return;
      }
      setCampaignId(saved.campaignId);

      // 2) Leads in Chargen senden.
      const acc: RunProgress = {
        sent: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        skippedAlreadySent: 0,
        skippedNoEmail: 0,
        skippedNotEnriched: 0,
        skippedDuplicate: 0,
      };
      setProgress({ ...acc });
      let offset = 0;
      let sendFailed = false;
      for (let i = 0; i < 10000; i++) {
        const r = await sendListToInstantlyAction({
          listId,
          filter: { onlyEnriched, skipAlreadySent, skipWorkspaceDuplicates },
          offset,
        });
        if (r.error) {
          setRunError(r.error);
          sendFailed = true;
          break;
        }
        acc.sent += r.sent;
        acc.updated += r.updated;
        acc.skippedAlreadySent += r.skippedAlreadySent;
        acc.skippedNoEmail += r.skippedNoEmail;
        acc.skippedNotEnriched += r.skippedNotEnriched;
        acc.skippedDuplicate += r.skippedDuplicate;
        acc.skipped +=
          r.skippedNoEmail +
          r.skippedNotEnriched +
          r.skippedAlreadySent +
          r.skippedDuplicate;
        acc.failed += r.failed;
        offset += r.processed;
        setProgress({ ...acc });
        if (r.remaining <= 0 || r.processed === 0) break;
      }

      // 3) Live/Draft anwenden — erst mit eingespielten Leads (sonst startet
      //    Instantly leer). Bei "Draft" wird pausiert.
      if (!sendFailed) {
        const res = await setInstantlyCampaignLiveAction({ listId, live });
        if (res.error) {
          setRunError(
            `Leads eingespielt, aber ${
              live ? "Live-Schaltung" : "Auf-Draft-Setzen"
            } fehlgeschlagen: ${res.error}`,
          );
        } else {
          setFinalLive(res.live);
        }
      }

      setDone(true);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const eligible = preview?.eligible ?? 0;
  const skipDetail = progress
    ? [
        progress.skippedAlreadySent > 0
          ? `${progress.skippedAlreadySent} bereits in Kampagne`
          : null,
        progress.skippedNoEmail > 0
          ? `${progress.skippedNoEmail} ohne E-Mail`
          : null,
        progress.skippedNotEnriched > 0
          ? `${progress.skippedNotEnriched} ohne Entscheider`
          : null,
        progress.skippedDuplicate > 0
          ? `${progress.skippedDuplicate} Duplikat(e) aus anderer Kampagne`
          : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const firstMailFilled =
    steps[0] && (steps[0].subject.trim() || steps[0].body.trim());
  const variables = columns
    .filter((c) => !c.hidden)
    .map((c) => ({ label: c.label, token: instantlyVarToken(c.key) }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
              <Send className="h-4 w-4 text-info" />
              {hasCampaign ? "Kampagne bearbeiten" : "Kampagne einrichten"}
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
                  Bereits Angeschriebene nicht erneut anschreiben
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={skipWorkspaceDuplicates}
                    onChange={(e) =>
                      setSkipWorkspaceDuplicates(e.target.checked)
                    }
                    className="h-3.5 w-3.5 rounded border-line"
                  />
                  Auf Duplikate achten (aus anderen Kampagnen)
                </label>
                <p className="text-[11px] text-sub">
                  Schon eingespielte Leads bekommen keine neue Erst-Mail — ihre
                  Spalten/Variablen in Instantly werden aber immer aktualisiert, damit
                  nichts veraltet. Leads ohne E-Mail werden übersprungen. Angehakt
                  werden zusätzlich Leads übersprungen, die bereits in einer anderen
                  Instantly-Kampagne stecken; ohne Haken werden sie trotzdem
                  eingespielt (Duplikate innerhalb derselben Kampagne entstehen nie).
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
                      ref={(el) => {
                        fieldRefs.current[`${i}:subject`] = el;
                      }}
                      onFocus={() => {
                        lastFocused.current = { i, field: "subject" };
                      }}
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      placeholder="Betreff"
                      className="w-full h-9 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
                    />
                    <textarea
                      ref={(el) => {
                        fieldRefs.current[`${i}:body`] = el;
                      }}
                      onFocus={() => {
                        lastFocused.current = { i, field: "body" };
                      }}
                      value={s.body}
                      onChange={(e) => updateStep(i, { body: e.target.value })}
                      placeholder="Text der E-Mail …"
                      rows={5}
                      className="w-full px-3 py-2 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30 resize-y"
                    />
                  </div>
                ))}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={addFollowup}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Follow-up hinzufügen
                  </button>
                  <button
                    ref={varBtnRef}
                    type="button"
                    onClick={openVarMenu}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                  >
                    <Braces className="h-3.5 w-3.5 text-info" />
                    Variable einfügen
                  </button>
                  <span className="text-[11px] text-sub">
                    Wird pro Lead automatisch ersetzt.
                  </span>
                </div>
              </div>

              {/* Status: Live / Draft */}
              <div className="rounded-lg border border-line bg-bg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Status</span>
                  <div className="inline-flex rounded-full border border-line bg-surface p-0.5">
                    <button
                      type="button"
                      onClick={() => setLive(true)}
                      className={cn(
                        "h-7 px-3.5 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5",
                        live ? "bg-ok text-white shadow" : "text-sub hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          live ? "bg-white" : "bg-sub/60",
                        )}
                      />
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setLive(false)}
                      className={cn(
                        "h-7 px-3.5 rounded-full text-xs font-semibold transition",
                        !live
                          ? "bg-sidebar text-white shadow"
                          : "text-sub hover:text-ink",
                      )}
                    >
                      Draft
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-warn">
                  {live
                    ? "Live startet den echten Mailversand (Mo–Fr 8–16 Uhr Berliner Zeit), sobald die Leads eingespielt sind."
                    : "Draft speichert nur Copy & Leads — es wird nichts versendet. Du kannst jederzeit auf Live umschalten."}
                </p>
              </div>
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
                  {progress.sent} neu eingespielt · {progress.updated}{" "}
                  aktualisiert
                  {progress.skipped > 0 && ` · ${progress.skipped} übersprungen`}
                  {skipDetail && ` (${skipDetail})`}
                  {progress.failed > 0 && ` · ${progress.failed} fehlgeschlagen`}
                </span>
              </div>
              {runError && <p className="mt-1 text-[11px] text-err">{runError}</p>}
              {done && !runError && (
                <p className="mt-1 text-[11px] text-sub">
                  Fertig.{" "}
                  {finalLive
                    ? "Kampagne ist live — der Versand läuft (Mo–Fr 8–16 Uhr Berlin)."
                    : "Als Draft gespeichert & Leads eingespielt — es wird nichts versendet."}
                </p>
              )}
            </div>
          )}
          {runError && !progress && (
            <p className="text-sm text-err">{runError}</p>
          )}
        </div>

        {/* Footer-Navigation */}
        <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-between gap-2 gap-y-2">
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
                  className="h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {busy
                    ? hasCampaign
                      ? "Speichere …"
                      : "Richte ein …"
                    : `${hasCampaign ? "Speichern" : "Einrichten"} & ${eligible} senden`}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {varMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setVarMenuOpen(false)}
          />
          <div
            style={{ left: varMenuPos.left, top: varMenuPos.top }}
            className="fixed z-[61] w-64 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface shadow-xl py-1"
          >
            {variables.length === 0 ? (
              <div className="px-3 py-2 text-xs text-sub">
                Keine Spalten vorhanden.
              </div>
            ) : (
              variables.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVariable(v.token)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-bg"
                >
                  <span className="truncate">{v.label}</span>
                  <code className="text-[10px] text-sub shrink-0">{`{{${v.token}}}`}</code>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
