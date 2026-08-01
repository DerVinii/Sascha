"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { dayKeyBerlin } from "@/lib/zeiterfassung";
import { addTimeEntry } from "../../../actions";

export function EintragHinzufuegen({
  employeeId,
  /** Angezeigter Monat als „JJJJ-MM“. Ohne Angabe gilt der heutige Tag. */
  monat,
}: {
  employeeId: string;
  monat?: string;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [datum, setDatum] = useState("");
  const [beginn, setBeginn] = useState("");
  const [ende, setEnde] = useState("");
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Grenzen des angezeigten Monats — damit nichts versehentlich im laufenden
  // Monat landet, während die Tabelle einen anderen zeigt.
  const grenzen = useMemo(() => {
    if (!monat || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return null;
    const [jahr, mon] = monat.split("-").map(Number);
    // Tag 0 des Folgemonats = letzter Tag dieses Monats.
    const letzter = new Date(Date.UTC(jahr, mon, 0)).getUTCDate();
    return {
      von: `${monat}-01`,
      bis: `${monat}-${String(letzter).padStart(2, "0")}`,
    };
  }, [monat]);

  // Heutiger Tag erst im Client — sonst weicht der Server-HTML-Wert ab.
  // Liegt heute nicht im angezeigten Monat, wird dessen Monatsanfang vorbelegt.
  useEffect(() => {
    if (!offen || datum) return;
    const heute = dayKeyBerlin(new Date());
    if (!grenzen) {
      setDatum(heute);
      return;
    }
    setDatum(heute >= grenzen.von && heute <= grenzen.bis ? heute : grenzen.von);
  }, [offen, datum, grenzen]);

  useEffect(() => {
    if (!offen) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key !== "Escape" || pending) return;
      setOffen(false);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [offen, pending]);

  function speichern() {
    setFehler(null);
    if (!datum || !beginn) {
      setFehler("Bitte Tag und Beginn angeben.");
      return;
    }
    if (grenzen && (datum < grenzen.von || datum > grenzen.bis)) {
      setFehler(
        "Der Tag liegt außerhalb des angezeigten Monats. Bitte zuerst zum passenden Monat wechseln.",
      );
      return;
    }
    if (grund.trim().length < 5) {
      setFehler("Bitte eine Begründung angeben (mind. 5 Zeichen).");
      return;
    }
    startTransition(async () => {
      try {
        const res = await addTimeEntry({
          employeeId,
          datum,
          beginn,
          ende: ende ? ende : null,
          grund: grund.trim(),
        });
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setOffen(false);
        setDatum("");
        setBeginn("");
        setEnde("");
        setGrund("");
        router.refresh();
      } catch {
        setFehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  const feldKlasse =
    "w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setFehler(null);
            setOffen(true);
          }}
          className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Eintrag hinzufügen
        </button>
        {/* Auch nach dem Schließen sichtbar — sonst sieht ein Fehlschlag wie
            ein erfolgreiches Speichern aus. */}
        {!offen && fehler && (
          <p className="text-xs text-err text-right max-w-[16rem]">{fehler}</p>
        )}
      </div>

      {offen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          // Abstand oben/unten inklusive Safe-Area, sonst liegt der Dialog auf
          // dem iPhone unter Dynamic Island bzw. Home-Indikator. Ohne Notch
          // sind die Insets 0 — dort bleibt es bei den 1rem aus `p-4`.
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOffen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          {/* max-h-full statt 90vh: vh rechnet auf dem iPhone die Safe-Area und
              die Browserleisten mit — der Dialog ragte sonst darunter. */}
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-full overflow-y-auto text-left">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                Eintrag hinzufügen
              </h2>
              <button
                type="button"
                onClick={() => setOffen(false)}
                disabled={pending}
                aria-label="Schließen"
                // -m-3 gleicht die Fläche wieder aus: das Kreuz bleibt optisch
                // an derselben Stelle, die Tippfläche wächst auf 40 × 40.
                className="-m-3 h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-sub">
              Für Zeiten, die von Hand nachgetragen werden — etwa wenn jemand das
              Stempeln vergessen hat.
            </p>

            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Tag
              </label>
              <input
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                min={grenzen?.von}
                max={grenzen?.bis}
                className={feldKlasse}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Beginn
                </label>
                <input
                  type="time"
                  value={beginn}
                  onChange={(e) => setBeginn(e.target.value)}
                  className={feldKlasse}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Ende (optional)
                </label>
                <input
                  type="time"
                  value={ende}
                  onChange={(e) => setEnde(e.target.value)}
                  className={feldKlasse}
                />
              </div>
            </div>

            <p className="text-xs text-sub">
              Ende leer lassen heißt „läuft noch“. Liegt das Ende vor dem Beginn,
              wird es automatisch als Nachtschicht auf den Folgetag gelegt.
            </p>

            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Begründung
              </label>
              <textarea
                rows={2}
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                placeholder="z. B. Stempeln vergessen, Zeit laut Notiz nachgetragen"
                className="w-full px-2 py-1.5 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            {fehler && <p className="text-xs text-err">{fehler}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOffen(false)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={speichern}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Speichern …" : "Hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
