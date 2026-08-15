"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sichtbarer Karten-Titel (kurz) vs. gespeicherter/gesendeter Wert (ausgeschrieben). */
const STANDORT_LABEL = "Standort- / Akademieleitung";
const STANDORT_ROLE = "Standortleitung / Akademieleitung";

type Selection = "gf" | "standort" | "custom";

type Props = {
  open: boolean;
  /** Aktuell gespeicherte Zielrolle des Ordners — null = Geschäftsführung/Standard. */
  enrichmentRole: string | null;
  onClose: () => void;
  onStart: (zielrolle: string | null) => Promise<void> | void;
};

export function UpdateCellsModal({
  open,
  enrichmentRole,
  onClose,
  onStart,
}: Props) {
  const [selection, setSelection] = useState<Selection>("gf");
  const [customText, setCustomText] = useState("");
  const [pending, startTransition] = useTransition();

  // Beim Öffnen mit der gespeicherten Rolle vorbelegen — bewusst nur an "open"
  // gekoppelt (nicht an enrichmentRole), sonst würde eine Auswahl mitten in der
  // Eingabe zurückgesetzt, falls die Tabelle im Hintergrund neu lädt.
  useEffect(() => {
    if (!open) return;
    if (enrichmentRole === null) {
      setSelection("gf");
      setCustomText("");
    } else if (enrichmentRole === STANDORT_ROLE) {
      setSelection("standort");
      setCustomText("");
    } else {
      setSelection("custom");
      setCustomText(enrichmentRole);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    if (pending) return;
    onClose();
  }

  // Escape schließt den Dialog (nicht während des Starts).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  if (!open) return null;

  const trimmedCustom = customText.trim();
  const canStart = selection !== "custom" || trimmedCustom.length > 0;

  function submit() {
    if (!canStart || pending) return;
    const zielrolle: string | null =
      selection === "gf"
        ? null
        : selection === "standort"
          ? STANDORT_ROLE
          : trimmedCustom;
    startTransition(async () => {
      await onStart(zielrolle);
    });
  }

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
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* max-h-full + flex-col: auf dem Handy scrollt der Inhalt, die Knöpfe
          unten bleiben erreichbar. */}
      <div className="w-full max-w-md max-h-full flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-info" />
            Lead-Recherche starten
          </h3>
          {/* p-3/-m-3: 40px Fingerfläche, ohne das Layout zu verändern. */}
          <button
            onClick={close}
            disabled={pending}
            aria-label="Schließen"
            className="shrink-0 p-3 -m-3 text-sub hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm font-medium text-ink">
            Wen soll die Recherche als Entscheider finden?
          </p>

          <div className="space-y-2">
            <RoleOption
              selected={selection === "gf"}
              onSelect={() => setSelection("gf")}
              title="Geschäftsführung"
              description="Standard — sucht die Geschäftsführung des Unternehmens."
            />
            <RoleOption
              selected={selection === "standort"}
              onSelect={() => setSelection("standort")}
              title={STANDORT_LABEL}
              description="Für Träger mit vielen Standorten (z. B. Bildungsträger): sucht die Leitung des jeweiligen Standorts statt der Zentrale."
            />
            <RoleOption
              selected={selection === "custom"}
              onSelect={() => setSelection("custom")}
              title="Eigene Rolle"
            >
              <input
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  setSelection("custom");
                }}
                onFocus={() => setSelection("custom")}
                placeholder="z. B. Einrichtungsleitung, Pflegedienstleitung"
                className="mt-1.5 w-full h-9 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </RoleOption>
          </div>

          <p className="text-xs text-sub">
            Die Auswahl wird für diesen Ordner gemerkt. Danach läuft die
            Recherche im Hintergrund weiter — auch wenn du die App schließt.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={close}
            disabled={pending}
            className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending || !canStart}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Recherche starten
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleOption({
  selected,
  title,
  description,
  onSelect,
  children,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition",
        selected
          ? "border-accent-line bg-accent-faint"
          : "border-line bg-bg hover:border-sub",
      )}
    >
      <input
        type="radio"
        name="zielrolle"
        checked={selected}
        onChange={onSelect}
        className="mt-1 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description && (
          <span className="block text-xs text-sub mt-0.5">{description}</span>
        )}
        {children}
      </div>
    </label>
  );
}
