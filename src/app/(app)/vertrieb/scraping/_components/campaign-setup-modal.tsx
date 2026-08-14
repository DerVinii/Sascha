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
  LayoutTemplate,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { menuPosition, type MenuRect } from "@/lib/dropdown-position";
import { instantlyVarToken } from "@/lib/scraping-types";
import type {
  CampaignStep,
  CampaignTemplate,
  InstantlySendPreview,
  LeadColumn,
} from "@/lib/scraping-types";
import {
  deleteCampaignTemplateAction,
  getCampaignSetupAction,
  listCampaignTemplatesAction,
  previewInstantlySendAction,
  saveCampaignAction,
  saveCampaignTemplateAction,
  sendListToInstantlyAction,
  setInstantlyCampaignLiveAction,
} from "../actions";
import { listSignaturesAction } from "@/app/(app)/postfach/signature-actions";
import type { EmailSignature } from "@/lib/signature";

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
  skippedDuplicate: number;
};

/** Wunschmaße des Variablen-Menüs; beide Werte werden bei Platzmangel gekürzt. */
const VAR_MENU_WIDTH = 256;
const VAR_MENU_MAX_HEIGHT = 240;
/** Vorlagen-Menü: breiter (Namen + Datum) und höher (Liste + Speichern-Feld). */
const TPL_MENU_WIDTH = 300;
const TPL_MENU_MAX_HEIGHT = 340;

/** Menü am Knopf ausrichten — immer vollständig im Fenster (siehe menuPosition). */
function menuPosFuer(knopf: DOMRect, groesse: Groesse): MenuRect {
  return menuPosition(knopf, {
    ...groesse,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
}

type Groesse = { width: number; maxHeight: number };

/**
 * Offenes Menü am Knopf halten: bei Größenänderung (Handy drehen, Tastatur
 * auf/zu) neu ausrichten, beim Scrollen außerhalb schließen — sonst klebt es an
 * einer Stelle, an der der Knopf längst nicht mehr steht. Scrollen IM Menü ist
 * ausgenommen, sonst ließe sich die Liste nicht bedienen.
 */
function useMenuAnchor(
  open: boolean,
  btnRef: React.RefObject<HTMLButtonElement | null>,
  menuRef: React.RefObject<HTMLDivElement | null>,
  groesse: Groesse,
  setPos: (r: MenuRect) => void,
  close: () => void,
  /**
   * "schliessen" für Knöpfe, die mitscrollen (sonst bliebe das Menü stehen);
   * "folgen" für Knöpfe in der festen Fußzeile — dort darf ein Scrollen, das
   * die Handy-Tastatur auslöst, das Menü nicht wegnehmen.
   */
  scrollVerhalten: "schliessen" | "folgen" = "schliessen",
) {
  const { width, maxHeight } = groesse;
  useEffect(() => {
    if (!open) return;
    const neuAusrichten = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos(menuPosFuer(r, { width, maxHeight }));
    };
    const beimScrollen = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (scrollVerhalten === "folgen") neuAusrichten();
      else close();
    };
    window.addEventListener("resize", neuAusrichten);
    window.addEventListener("scroll", beimScrollen, true);
    return () => {
      window.removeEventListener("resize", neuAusrichten);
      window.removeEventListener("scroll", beimScrollen, true);
    };
  }, [open, btnRef, menuRef, width, maxHeight, setPos, close, scrollVerhalten]);
}

/** Kurzes Datum fürs Vorlagen-Menü ("zuletzt gespeichert"). */
function kurzDatum(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
}

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

  // „Bereits Angeschriebene überspringen" und „Duplikate aus anderen Kampagnen
  // überspringen" laufen ab jetzt IMMER mit (keine Auswahl mehr) — die filter-
  // Objekte weiter unten setzen beide fest auf true.
  const [preview, setPreview] = useState<InstantlySendPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [steps, setSteps] = useState<CampaignStep[]>([
    { subject: "", body: "", delayDays: 0 },
  ]);
  // Signaturen der Organisation — für „Signatur einfügen" in der Copy.
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
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
  const varMenuRef = useRef<HTMLDivElement | null>(null);
  const [varMenuOpen, setVarMenuOpen] = useState(false);
  const [varMenuPos, setVarMenuPos] = useState<MenuRect>({
    left: 0,
    top: 0,
    width: VAR_MENU_WIDTH,
    maxHeight: VAR_MENU_MAX_HEIGHT,
  });

  // Vorlagen: gespeicherte Texte anwenden oder die aktuellen sichern.
  const tplBtnRef = useRef<HTMLButtonElement | null>(null);
  const tplMenuRef = useRef<HTMLDivElement | null>(null);
  const [tplMenuOpen, setTplMenuOpen] = useState(false);
  const [tplMenuPos, setTplMenuPos] = useState<MenuRect>({
    left: 0,
    top: 0,
    width: TPL_MENU_WIDTH,
    maxHeight: TPL_MENU_MAX_HEIGHT,
  });
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [tplName, setTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  /** Kurze Rückmeldung unter den Fußknöpfen („… angewendet/gespeichert"). */
  const [tplHint, setTplHint] = useState<string | null>(null);

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
      filter: { skipAlreadySent: true, skipWorkspaceDuplicates: true },
    })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => {})
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, listId]);

  // Vorlagen der Organisation einmal je Öffnen laden (ordnerübergreifend).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTplHint(null);
    setTplError(null);
    setTplName("");
    listCampaignTemplatesAction()
      .then((t) => !cancelled && setTemplates(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Signaturen je Öffnen laden (für „Signatur einfügen").
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listSignaturesAction()
      .then((s) => !cancelled && setSignatures(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const schliesseVarMenu = useCallback(() => setVarMenuOpen(false), []);
  const schliesseTplMenu = useCallback(() => setTplMenuOpen(false), []);

  useMenuAnchor(
    varMenuOpen,
    varBtnRef,
    varMenuRef,
    { width: VAR_MENU_WIDTH, maxHeight: VAR_MENU_MAX_HEIGHT },
    setVarMenuPos,
    schliesseVarMenu,
  );
  useMenuAnchor(
    tplMenuOpen,
    tplBtnRef,
    tplMenuRef,
    { width: TPL_MENU_WIDTH, maxHeight: TPL_MENU_MAX_HEIGHT },
    setTplMenuPos,
    schliesseTplMenu,
    "folgen",
  );

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
    if (r)
      setVarMenuPos(
        menuPosFuer(r, {
          width: VAR_MENU_WIDTH,
          maxHeight: VAR_MENU_MAX_HEIGHT,
        }),
      );
    setVarMenuOpen((v) => !v);
  }

  function openTplMenu() {
    const r = tplBtnRef.current?.getBoundingClientRect();
    if (r)
      setTplMenuPos(
        menuPosFuer(r, {
          width: TPL_MENU_WIDTH,
          maxHeight: TPL_MENU_MAX_HEIGHT,
        }),
      );
    setTplError(null);
    setTplMenuOpen((v) => !v);
  }

  /** Vorlage anwenden: ersetzt die Texte vollständig (bewusst ohne Rückfrage). */
  function applyTemplate(t: CampaignTemplate) {
    setSteps(
      t.steps.length ? t.steps : [{ subject: "", body: "", delayDays: 0 }],
    );
    // Sonst zeigt „Variable einfügen" auf ein Feld, das es nicht mehr gibt.
    lastFocused.current = null;
    setTplMenuOpen(false);
    setTplHint(`Vorlage „${t.name}" angewendet.`);
  }

  async function saveTemplate() {
    const name = tplName.trim();
    if (!name || tplBusy) return;
    const vorhanden = templates.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (
      vorhanden &&
      !confirm(`Es gibt schon eine Vorlage „${vorhanden.name}". Überschreiben?`)
    )
      return;

    setTplBusy(true);
    setTplError(null);
    try {
      const res = await saveCampaignTemplateAction({ name, steps });
      if (res.error || !res.template) {
        setTplError(res.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      const gespeichert = res.template;
      setTemplates((prev) =>
        [...prev.filter((t) => t.id !== gespeichert.id), gespeichert].sort(
          (a, b) => a.name.localeCompare(b.name, "de"),
        ),
      );
      setTplName("");
      setTplMenuOpen(false);
      setTplHint(`Vorlage „${gespeichert.name}" gespeichert.`);
    } catch (e) {
      setTplError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setTplBusy(false);
    }
  }

  async function deleteTemplate(t: CampaignTemplate) {
    if (!confirm(`Vorlage „${t.name}" löschen?`)) return;
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    try {
      await deleteCampaignTemplateAction({ id: t.id });
    } catch {
      // Löschen fehlgeschlagen → Liste beim nächsten Öffnen wieder korrekt.
      setTplError("Löschen fehlgeschlagen.");
    }
  }

  /** Fügt einen fertigen Text an der Cursor-Position des zuletzt fokussierten Felds ein. */
  function insertAtCursor(literal: string) {
    const lf = lastFocused.current;
    let i = lf ? lf.i : 0;
    const field: "subject" | "body" = lf ? lf.field : "body";
    if (!steps[i]) i = 0;
    const key = `${i}:${field}`;
    const el = fieldRefs.current[key];
    const cur = steps[i]?.[field] ?? "";
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? start;
    const next = cur.slice(0, start) + literal + cur.slice(end);
    updateStep(i, field === "subject" ? { subject: next } : { body: next });
    const pos = start + literal.length;
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

  /** Lead-Variable {{token}} — wird bei Instantly pro Lead ersetzt. */
  function insertVariable(token: string) {
    insertAtCursor(`{{${token}}}`);
  }

  /** Signatur {Name} — wird beim Versand serverseitig durch die Signatur ersetzt. */
  function insertSignature(name: string) {
    insertAtCursor(`{${name}}`);
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
        skippedDuplicate: 0,
      };
      setProgress({ ...acc });
      let offset = 0;
      let sendFailed = false;
      for (let i = 0; i < 10000; i++) {
        const r = await sendListToInstantlyAction({
          listId,
          filter: { skipAlreadySent: true, skipWorkspaceDuplicates: true },
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
        acc.skippedDuplicate += r.skippedDuplicate;
        acc.skipped +=
          r.skippedNoEmail + r.skippedAlreadySent + r.skippedDuplicate;
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
      style={{
        background: "rgba(15,23,42,0.45)",
        // Sicherheitsabstand zu Notch und Home-Indikator (viewport-fit=cover);
        // auf Desktop sind die Insets 0 → bleibt bei den 1rem aus p-4.
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {/* max-h-full auf dem Handy: 90dvh wären mittig zentriert höher als der
          Platz zwischen Notch und Home-Indikator. Ab md bleibt es bei 90dvh. */}
      <div className="w-full max-w-2xl max-h-full md:max-h-[90dvh] flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
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
          {/* p-3/-m-3: 40px Fingerfläche, ohne das Layout zu verändern. */}
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
            className="shrink-0 p-3 -m-3 text-sub hover:text-ink disabled:opacity-40"
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
                <p className="text-[11px] text-sub">
                  Gesendet wird immer an die verifizierte Entscheider-E-Mail
                  (Spalte Email_Entscheider), falls gefunden — sonst an die
                  normale E-Mail. Leads ganz ohne E-Mail werden übersprungen.
                  Zwei Filter laufen automatisch mit: Bereits angeschriebene Leads
                  bekommen keine neue Erst-Mail (ihre Spalten/Variablen in Instantly
                  werden aber immer aktualisiert, damit nichts veraltet), und Leads,
                  die schon in einer anderen Instantly-Kampagne stecken, werden
                  übersprungen — so wird niemand aus zwei Kampagnen doppelt
                  angeschrieben. (Duplikate innerhalb derselben Kampagne entstehen nie.)
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
                      · {preview.noEmail} ohne · {preview.withFinderEmail} mit
                      Entscheider-E-Mail
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
                              className="h-9 md:h-6 w-14 px-1.5 rounded border border-line bg-surface text-ink text-xs focus:outline-none"
                            />
                            Tage
                          </label>
                        )}
                        {steps.length > 1 && (
                          // p-3/-m-3: 40px Fingerfläche, ohne das Layout zu ändern.
                          <button
                            onClick={() => removeStep(i)}
                            className="shrink-0 p-3 -m-3 text-sub hover:text-err"
                            title="Schritt entfernen"
                            aria-label="Schritt entfernen"
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
                    className="h-9 md:h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Follow-up hinzufügen
                  </button>
                  <button
                    ref={varBtnRef}
                    type="button"
                    onClick={openVarMenu}
                    className="h-9 md:h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                  >
                    <Braces className="h-3.5 w-3.5 text-info" />
                    Variable / Signatur einfügen
                  </button>
                  <span className="text-[11px] text-sub">
                    Variablen werden pro Lead ersetzt, Signaturen beim Versand.
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
                        "h-9 md:h-7 px-3.5 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5",
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
                        "h-9 md:h-7 px-3.5 rounded-full text-xs font-semibold transition",
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
          <div className="flex min-w-0 items-center gap-2">
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
            {tplHint && (
              <span className="truncate text-[11px] text-ok">{tplHint}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Vorlagen nur im Copy-Schritt: dort stehen die Texte, um die es geht. */}
            {step === 2 && !done && (
              <button
                ref={tplBtnRef}
                type="button"
                onClick={openTplMenu}
                disabled={busy}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-40"
              >
                <LayoutTemplate className="h-3.5 w-3.5 text-info" />
                Vorlagen
              </button>
            )}
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

      {tplMenuOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={schliesseTplMenu} />
          <div
            ref={tplMenuRef}
            style={{
              left: tplMenuPos.left,
              top: tplMenuPos.top,
              width: tplMenuPos.width,
              maxHeight: tplMenuPos.maxHeight,
            }}
            className="fixed z-[61] flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
          >
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-sub">
              Gespeicherte Vorlagen
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
              {templates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-sub">
                  Noch keine Vorlage gespeichert.
                </div>
              ) : (
                templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="min-w-0 flex-1 rounded px-2 py-2 md:py-1.5 text-left hover:bg-bg"
                    >
                      <span className="block truncate text-sm text-ink">
                        {t.name}
                      </span>
                      <span className="block text-[10px] text-sub">
                        {t.steps.length === 1
                          ? "1 Mail"
                          : `${t.steps.length} Mails`}{" "}
                        · {kurzDatum(t.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(t)}
                      title="Vorlage löschen"
                      aria-label={`Vorlage ${t.name} löschen`}
                      className="shrink-0 p-2 text-sub hover:text-err"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-line p-2 space-y-1.5">
              <div className="text-[11px] font-medium text-sub">
                Aktuelle Texte als Vorlage speichern
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveTemplate();
                    }
                  }}
                  placeholder="Name der Vorlage"
                  className="h-9 min-w-0 flex-1 px-2 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
                />
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={!tplName.trim() || tplBusy}
                  className="h-9 shrink-0 px-3 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {tplBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Speichern
                </button>
              </div>
              {tplError && <p className="text-[11px] text-err">{tplError}</p>}
            </div>
          </div>
        </>
      )}

      {varMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setVarMenuOpen(false)}
          />
          <div
            ref={varMenuRef}
            style={{
              left: varMenuPos.left,
              top: varMenuPos.top,
              width: varMenuPos.width,
              maxHeight: varMenuPos.maxHeight,
            }}
            className="fixed z-[61] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface shadow-xl py-1"
          >
            {signatures.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sub">
                  Signaturen
                </div>
                {signatures.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertSignature(s.name)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 md:py-1.5 text-left text-sm text-ink hover:bg-bg"
                  >
                    <span className="truncate">{s.name}</span>
                    <code className="text-[10px] text-sub shrink-0">{`{${s.name}}`}</code>
                  </button>
                ))}
                <div className="my-1 border-t border-line" />
                <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sub">
                  Lead-Variablen
                </div>
              </>
            )}
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
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 md:py-1.5 text-left text-sm text-ink hover:bg-bg"
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
