"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { RichTextEditor } from "@/components/app/rich-text-editor";
import type { EmailSignature } from "@/lib/signature";
import {
  createSignatureAction,
  deleteSignatureAction,
  saveSignatureAction,
} from "../signature-actions";

/**
 * Signatur-Verwaltung im Outlook-Aufbau („Signaturen und Briefpapier"):
 * oben die Liste der benannten Signaturen, darunter der Editor.
 *
 * Anlegen und Löschen werden sofort gespeichert; der Inhalt der gerade
 * offenen Signatur beim Wechsel, beim Klick auf „Speichern" und beim
 * Schließen.
 */
export function SignatureDialog({
  signatures,
  onSignaturesChange,
  onClose,
}: {
  signatures: EmailSignature[];
  onSignaturesChange: (list: EmailSignature[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(signatures);
  const [selectedId, setSelectedId] = useState<string | null>(
    signatures[0]?.id ?? null,
  );
  const [name, setName] = useState(signatures[0]?.name ?? "");
  const [html, setHtml] = useState(signatures[0]?.html ?? "");
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Aktueller Bearbeitungsstand für Speichervorgänge, die außerhalb des
  // Render-Zyklus laufen (Wechsel, Schließen) — vermeidet veraltete Closures.
  const draft = useRef({ id: selectedId, name, html, dirty });
  draft.current = { id: selectedId, name, html, dirty };

  function publish(next: EmailSignature[]) {
    setList(next);
    onSignaturesChange(next);
  }

  /** Speichert den offenen Entwurf; liefert die aktualisierte Liste. */
  async function persistDraft(): Promise<EmailSignature[] | null> {
    const d = draft.current;
    if (!d.id || !d.dirty) return null;
    if (!d.name.trim()) {
      setError("Der Name der Signatur darf nicht leer sein.");
      return null;
    }
    const next = await saveSignatureAction({
      id: d.id,
      name: d.name.trim(),
      html: d.html,
    });
    setDirty(false);
    publish(next);
    return next;
  }

  function select(id: string, from?: EmailSignature[]) {
    const source = from ?? list;
    const sig = source.find((s) => s.id === id);
    if (!sig) return;
    setSelectedId(sig.id);
    setName(sig.name);
    setHtml(sig.html);
    setDirty(false);
  }

  function switchTo(id: string) {
    if (id === selectedId) return;
    setError(null);
    startTransition(async () => {
      try {
        const next = await persistDraft();
        select(id, next ?? list);
      } catch (err) {
        setError(message(err, "Speichern fehlgeschlagen"));
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const next = await persistDraft();
        if (next) {
          setSavedAt(true);
          window.setTimeout(() => setSavedAt(false), 2000);
        }
      } catch (err) {
        setError(message(err, "Speichern fehlgeschlagen"));
      }
    });
  }

  function close() {
    startTransition(async () => {
      try {
        await persistDraft();
      } catch {
        /* Beim Schließen nicht blockieren — der Fehler wurde schon angezeigt. */
      }
      onClose();
    });
  }

  function create() {
    const value = (newName ?? "").trim();
    if (!value) {
      setError("Bitte einen Namen für die Signatur angeben.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await persistDraft();
        const next = await createSignatureAction({ name: value });
        publish(next);
        setNewName(null);
        const created = next.find((s) => !list.some((o) => o.id === s.id));
        if (created) select(created.id, next);
      } catch (err) {
        setError(message(err, "Anlegen fehlgeschlagen"));
      }
    });
  }

  function remove(id: string) {
    const sig = list.find((s) => s.id === id);
    if (!sig) return;
    if (!window.confirm(`Signatur „${sig.name}" wirklich löschen?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const next = await deleteSignatureAction({ id });
        publish(next);
        if (selectedId === id) {
          setDirty(false);
          if (next[0]) select(next[0].id, next);
          else {
            setSelectedId(null);
            setName("");
            setHtml("");
          }
        }
      } catch (err) {
        setError(message(err, "Löschen fehlgeschlagen"));
      }
    });
  }

  // Escape schließt (und speichert dabei).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl bg-surface sm:rounded-xl border border-line shadow-xl flex flex-col max-h-[94dvh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <h2 className="text-sm font-semibold text-ink">
            Signaturen und Briefpapier
          </h2>
          <button
            onClick={close}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-xs text-err">
              {error}
            </div>
          )}

          <div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-sub">
                Signatur zum Bearbeiten auswählen
              </p>
              <div className="rounded-md border border-line bg-bg max-h-44 overflow-y-auto">
                {list.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-sub">
                    Noch keine Signatur angelegt.
                  </p>
                ) : (
                  list.map((sig) => (
                    <button
                      key={sig.id}
                      onClick={() => switchTo(sig.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition border-b border-line/60 last:border-b-0 ${
                        sig.id === selectedId
                          ? "bg-accent-faint text-accent-ink font-medium"
                          : "text-ink hover:bg-surface"
                      }`}
                    >
                      <span className="flex-1 truncate">{sig.name}</span>
                    </button>
                  ))
                )}
              </div>

              {newName === null ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewName("")}
                    className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-ink hover:bg-bg transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Neu
                  </button>
                  <button
                    onClick={() => selectedId && remove(selectedId)}
                    disabled={!selectedId}
                    className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-err hover:border-err/40 transition disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        create();
                      }
                      if (e.key === "Escape") setNewName(null);
                    }}
                    placeholder="Name, z. B. Sascha Kühn"
                    className="h-8 flex-1 min-w-0 rounded-md border border-line bg-bg px-2 text-xs text-ink placeholder:text-sub focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                  <button
                    onClick={create}
                    className="h-8 px-2.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-hover transition"
                  >
                    Anlegen
                  </button>
                  <button
                    onClick={() => setNewName(null)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
                    aria-label="Abbrechen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[11px] font-medium text-sub">
                Signatur bearbeiten
              </p>
              {selectedId && (
                <>
                  <span className="text-[11px] text-sub">·</span>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Name der Signatur"
                    className="h-7 w-48 rounded-md border border-line bg-bg px-2 text-xs text-ink placeholder:text-sub focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </>
              )}
            </div>

            {selectedId ? (
              <RichTextEditor
                key={selectedId}
                value={html}
                onChange={(next) => {
                  setHtml(next);
                  setDirty(true);
                }}
                onError={setError}
                minHeight={200}
                maxHeight={340}
                placeholder="Signatur schreiben – Text formatieren und über das Bild-Symbol ein Logo einfügen."
              />
            ) : (
              <div className="rounded-md border border-dashed border-line bg-bg px-4 py-10 text-center text-xs text-sub">
                Lege oben links eine Signatur an, um sie hier zu bearbeiten.
              </div>
            )}

            <p className="text-[11px] text-sub leading-relaxed">
              Bilder werden beim Versand als eingebettete Anhänge mitgeschickt
              (CID) – so zeigt jeder Empfänger sie direkt in der Nachricht an.
            </p>
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-t border-line shrink-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <span className="text-[11px] text-sub inline-flex items-center gap-1.5">
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Speichert …
              </>
            ) : savedAt ? (
              <>
                <Check className="h-3.5 w-3.5 text-ok" />
                Gespeichert
              </>
            ) : dirty ? (
              "Nicht gespeicherte Änderungen"
            ) : (
              ""
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={!selectedId || !dirty || isPending}
              className="h-9 px-4 rounded-md border border-line text-sm font-medium text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
            >
              Speichern
            </button>
            <button
              onClick={close}
              disabled={isPending}
              className="h-9 px-5 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition disabled:opacity-50"
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
