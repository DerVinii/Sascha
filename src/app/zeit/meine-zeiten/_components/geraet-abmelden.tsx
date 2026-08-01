"use client";

import { useEffect, useState, useTransition } from "react";
import { LogOut, X } from "lucide-react";
import { geraetAbmelden } from "../actions";

/**
 * Bei Erfolg leitet die Server Action per `redirect()` auf /zeit/stempel um.
 * Next signalisiert das über eine geworfene Kontroll-Exception mit einem
 * `digest`, der mit "NEXT_REDIRECT" beginnt — die darf hier NICHT als Fehler
 * angezeigt, sondern muss weitergereicht werden.
 */
function istRedirect(fehler: unknown): boolean {
  if (typeof fehler !== "object" || fehler === null) return false;
  const digest = (fehler as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function GeraetAbmelden() {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Escape schließt den Dialog.
  useEffect(() => {
    if (!offen) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOffen(false);
    }
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [offen, pending]);

  function schliessen() {
    if (pending) return;
    setOffen(false);
  }

  function abmelden() {
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await geraetAbmelden();
        if (ergebnis && !ergebnis.ok) setFehler(ergebnis.error);
      } catch (f) {
        if (istRedirect(f)) throw f;
        setFehler("Das hat nicht geklappt. Bitte noch einmal versuchen.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFehler(null);
          setOffen(true);
        }}
        className="h-11 md:h-9 px-3 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium border border-line bg-surface text-sub hover:bg-bg hover:text-ink transition"
      >
        <LogOut className="h-4 w-4" />
        Gerät abmelden
      </button>

      {offen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          // Abstand oben/unten inklusive Safe-Area, sonst liegt der Dialog auf
          // dem iPhone unter Dynamic Island bzw. Home-Indikator.
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) schliessen();
          }}
        >
          <div className="rounded-xl border border-line bg-surface w-full max-w-sm shadow-xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold text-ink">
                Dieses Gerät abmelden?
              </h3>
              <button
                type="button"
                onClick={schliessen}
                // -m-3 gleicht die Fläche wieder aus: das Kreuz bleibt optisch
                // an derselben Stelle, die Tippfläche wächst auf 40 × 40.
                className="-m-3 h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-sub">
                Danach kannst du auf diesem Handy nicht mehr stempeln. Zum
                Wiederanmelden brauchst du einen neuen QR-Code von Sascha.
                Deine bereits erfassten Zeiten bleiben natürlich erhalten.
              </p>

              {fehler && <p className="text-sm text-err">{fehler}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={schliessen}
                  disabled={pending}
                  className="flex-1 h-11 md:h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={abmelden}
                  disabled={pending}
                  className="flex-1 h-11 md:h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Wird abgemeldet …" : "Abmelden"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
