"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/zeiterfassung";
import {
  deleteEmployee,
  renameEmployee,
  setEmployeeActive,
} from "../../../actions";

/**
 * Randabstand der Vollbild-Overlays inklusive Safe-Area: auf dem iPhone liegt
 * der Dialog sonst unter Dynamic Island bzw. Home-Indikator. Ohne Notch sind
 * die Insets 0 — dort bleibt es bei den 1rem aus `p-4`.
 */
const OVERLAY_ABSTAND = {
  paddingTop: "max(1rem, env(safe-area-inset-top))",
  paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
};

export function MitarbeiterKopf({
  id,
  name,
  aktiv,
  erstelltAm,
}: {
  id: string;
  name: string;
  aktiv: boolean;
  /** ISO-String */
  erstelltAm: string;
}) {
  const router = useRouter();
  const [umbenennen, setUmbenennen] = useState(false);
  const [entwurf, setEntwurf] = useState(name);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschDialog, setLoeschDialog] = useState(false);
  // Deaktivieren meldet alle Geräte ab — deshalb nie ohne Rückfrage.
  const [deaktivierDialog, setDeaktivierDialog] = useState(false);
  const [pending, startTransition] = useTransition();
  const eingabe = useRef<HTMLInputElement | null>(null);

  // Nach einem Server-Refresh den Entwurf wieder auf den echten Namen ziehen.
  useEffect(() => {
    setEntwurf(name);
  }, [name]);

  useEffect(() => {
    if (umbenennen) eingabe.current?.focus();
  }, [umbenennen]);

  // Escape schließt den Lösch-Dialog (solange nichts läuft).
  useEffect(() => {
    if (!loeschDialog) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setLoeschDialog(false);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [loeschDialog, pending]);

  // Escape schließt den Deaktivieren-Dialog (solange nichts läuft).
  useEffect(() => {
    if (!deaktivierDialog) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setDeaktivierDialog(false);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [deaktivierDialog, pending]);

  function nameSpeichern() {
    const neu = entwurf.trim();
    setFehler(null);
    if (neu === name) {
      setUmbenennen(false);
      return;
    }
    startTransition(async () => {
      try {
        const res = await renameEmployee(id, neu);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setUmbenennen(false);
        router.refresh();
      } catch {
        setFehler("Umbenennen fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  // Aktivieren ist harmlos und läuft ohne Rückfrage.
  function aktivieren() {
    setFehler(null);
    startTransition(async () => {
      try {
        const res = await setEmployeeActive(id, true);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        router.refresh();
      } catch {
        setFehler("Änderung fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  function mitarbeiterLoeschen() {
    setFehler(null);
    startTransition(async () => {
      try {
        const res = await deleteEmployee(id);
        if (!res.ok) {
          setFehler(res.error);
          setLoeschDialog(false);
          return;
        }
        router.push("/zeiterfassung/mitarbeiter");
      } catch {
        setFehler("Löschen fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  // Wird sowohl aus dem Lösch-Dialog („Nur deaktivieren“) als auch aus der
  // Rückfrage am Schalter aufgerufen.
  function deaktivieren() {
    setFehler(null);
    startTransition(async () => {
      try {
        const res = await setEmployeeActive(id, false);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setLoeschDialog(false);
        setDeaktivierDialog(false);
        router.refresh();
      } catch {
        setFehler("Deaktivieren fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Link
        href="/zeiterfassung/mitarbeiter"
        className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Liste
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {umbenennen ? (
            <div className="flex items-center gap-2">
              <input
                ref={eingabe}
                value={entwurf}
                onChange={(e) => setEntwurf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") nameSpeichern();
                  if (e.key === "Escape") {
                    setEntwurf(name);
                    setUmbenennen(false);
                  }
                }}
                maxLength={80}
                className="h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <button
                type="button"
                onClick={nameSpeichern}
                disabled={pending}
                aria-label="Namen speichern"
                className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntwurf(name);
                  setUmbenennen(false);
                  setFehler(null);
                }}
                aria-label="Abbrechen"
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg inline-flex items-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-ink truncate">
                {name}
              </h1>
              <button
                type="button"
                onClick={() => setUmbenennen(true)}
                aria-label="Namen ändern"
                title="Namen ändern"
                // -m-3 gleicht die Fläche wieder aus: der Stift bleibt optisch
                // an derselben Stelle, die Tippfläche wächst auf 40 × 40.
                className="-m-3 h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-sub mt-1">
            {aktiv ? "Aktiv" : "Deaktiviert"} · angelegt am{" "}
            {formatDate(erstelltAm)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink select-none">
            <button
              type="button"
              role="switch"
              aria-checked={aktiv}
              aria-label={aktiv ? "Mitarbeiter deaktivieren" : "Mitarbeiter aktivieren"}
              onClick={() => {
                setFehler(null);
                if (aktiv) setDeaktivierDialog(true);
                else aktivieren();
              }}
              disabled={pending}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
                aktiv ? "bg-ok" : "bg-line",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  aktiv ? "left-[1.125rem]" : "left-0.5",
                )}
              />
            </button>
            {aktiv ? "Aktiv" : "Deaktiviert"}
          </label>

          <button
            type="button"
            onClick={() => setLoeschDialog(true)}
            className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-err hover:bg-err/10 inline-flex items-center gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            Löschen
          </button>
        </div>
      </div>

      <p className="text-xs text-sub">
        Beim Deaktivieren werden alle gekoppelten Geräte abgemeldet. Ein
        späteres Aktivieren stellt sie nicht wieder her — das Handy muss dann
        neu per QR-Code gekoppelt werden.
      </p>

      {fehler && <p className="text-xs text-err">{fehler}</p>}

      {deaktivierDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          style={OVERLAY_ABSTAND}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending)
              setDeaktivierDialog(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-full overflow-y-auto">
            <h2 className="text-sm font-semibold text-ink">
              Mitarbeiter deaktivieren?
            </h2>
            <p className="text-sm text-ink">
              <span className="font-medium">{name}</span> kann danach nicht mehr
              stempeln. Dabei werden{" "}
              <span className="font-medium">alle gekoppelten Geräte</span>{" "}
              abgemeldet.
            </p>
            <p className="text-xs text-sub">
              Ein späteres Aktivieren gibt die Geräte nicht wieder frei — der
              Mitarbeiter muss sein Handy dann neu per QR-Code koppeln. Bereits
              erfasste Zeiten bleiben erhalten.
            </p>
            {fehler && <p className="text-xs text-err">{fehler}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeaktivierDialog(false)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={deaktivieren}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Wird deaktiviert …" : "Deaktivieren"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loeschDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          style={OVERLAY_ABSTAND}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setLoeschDialog(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-full overflow-y-auto">
            <h2 className="text-sm font-semibold text-ink">
              {name} wirklich löschen?
            </h2>
            <p className="text-sm text-ink">
              Alle erfassten Zeiten dieses Mitarbeiters werden unwiderruflich
              gelöscht. Auch gekoppelte Geräte, Einrichtungs-Codes und der
              Änderungsverlauf verschwinden mit.
            </p>
            <p className="text-xs text-sub">
              Schonender: den Mitarbeiter nur deaktivieren. Dann bleiben alle
              Zeiten für die Abrechnung erhalten, das Handy kann aber nicht mehr
              stempeln.
            </p>
            {fehler && <p className="text-xs text-err">{fehler}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLoeschDialog(false)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              {aktiv && (
                <button
                  type="button"
                  onClick={deaktivieren}
                  disabled={pending}
                  className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                >
                  Nur deaktivieren
                </button>
              )}
              <button
                type="button"
                onClick={mitarbeiterLoeschen}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Wird gelöscht …" : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
