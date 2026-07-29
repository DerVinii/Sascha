"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Thermometer, X } from "lucide-react";
import { dayKeyBerlin } from "@/lib/zeiterfassung";
import { krankMelden } from "../actions";

function tageWort(anzahl: number): string {
  return anzahl === 1 ? "1 Tag" : `${anzahl} Tage`;
}

function erfolgsText(angelegt: number, uebersprungen: number): string {
  const kern =
    angelegt === 0
      ? "Keine neuen Tage erfasst"
      : `${tageWort(angelegt)} als krank erfasst`;
  if (uebersprungen === 0) return `${kern}.`;
  const war = uebersprungen === 1 ? "war" : "waren";
  return `${kern} (${tageWort(uebersprungen)} ${war} bereits erfasst).`;
}

export function KrankDialog() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Beim Öffnen mit „heute“ vorbelegen — erst hier, damit die Uhr des Handys
  // nicht ins Server-HTML gerät.
  useEffect(() => {
    if (!offen) return;
    const heute = dayKeyBerlin(new Date());
    setVon(heute);
    setBis(heute);
    setFehler(null);
    setErfolg(null);
  }, [offen]);

  // Escape schließt den Dialog.
  useEffect(() => {
    if (!offen) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape") schliessen();
    }
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen, pending]);

  function schliessen() {
    if (pending) return;
    setOffen(false);
  }

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (!von || !bis) {
      setFehler("Bitte einen Zeitraum wählen.");
      return;
    }
    if (bis < von) {
      setFehler("Das Enddatum darf nicht vor dem Startdatum liegen.");
      return;
    }
    startTransition(async () => {
      try {
        const ergebnis = await krankMelden(von, bis);
        if (!ergebnis.ok) {
          setFehler(ergebnis.error);
          return;
        }
        setErfolg(erfolgsText(ergebnis.angelegt, ergebnis.uebersprungen));
        router.refresh();
      } catch {
        setFehler("Das hat nicht geklappt. Bitte noch einmal versuchen.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="w-full h-9 px-3 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium border border-line bg-surface text-sub hover:bg-bg hover:text-ink transition"
      >
        <Thermometer className="h-4 w-4" />
        Krank melden
      </button>

      {offen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) schliessen();
          }}
        >
          <div className="rounded-xl border border-line bg-surface w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold text-ink">Krank melden</h3>
              <button
                type="button"
                onClick={schliessen}
                className="text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {erfolg ? (
              <div className="p-5 space-y-4">
                <p className="text-sm text-ink">{erfolg}</p>
                <button
                  type="button"
                  onClick={() => setOffen(false)}
                  className="w-full h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90"
                >
                  Fertig
                </button>
              </div>
            ) : (
              <form onSubmit={absenden} className="p-5 space-y-4">
                <p className="text-sm text-sub">
                  Für jeden Tag im Zeitraum werden 8 Stunden erfasst
                  (08:00–16:00). Für einen einzelnen Tag bei „Von“ und „Bis“
                  denselben Tag wählen.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="krank-von"
                      className="block text-[11px] font-medium text-sub mb-1"
                    >
                      Von
                    </label>
                    <input
                      id="krank-von"
                      type="date"
                      value={von}
                      onChange={(e) => {
                        const wert = e.target.value;
                        setVon(wert);
                        // „Bis“ mitziehen, solange es vor dem neuen Start liegt.
                        if (bis && bis < wert) setBis(wert);
                      }}
                      className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="krank-bis"
                      className="block text-[11px] font-medium text-sub mb-1"
                    >
                      Bis
                    </label>
                    <input
                      id="krank-bis"
                      type="date"
                      value={bis}
                      min={von || undefined}
                      onChange={(e) => setBis(e.target.value)}
                      className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                </div>

                <p className="text-xs text-sub">
                  Bereits erfasste Tage (z. B. eine gestempelte Schicht) bleiben
                  unverändert.
                </p>

                {fehler && <p className="text-sm text-err">{fehler}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={schliessen}
                    disabled={pending}
                    className="flex-1 h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="flex-1 h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "Speichern …" : "Krank melden"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
