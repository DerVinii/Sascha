"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createEmployee } from "../../actions";
import {
  EinladungAnzeige,
  type Einladung,
} from "../../_components/einladung-anzeige";

export function NeuerMitarbeiterButton() {
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Nach dem Anlegen zeigt derselbe Dialog den Einrichtungs-Link. Der Link
  // kommt genau einmal vom Server und lebt nur in diesem State.
  const [angelegt, setAngelegt] = useState<{
    name: string;
    einladung: Einladung;
  } | null>(null);

  // Escape schließt den Dialog — solange nicht gerade gespeichert wird.
  useEffect(() => {
    if (!offen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) schliessen();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offen, pending]);

  function schliessen() {
    setOffen(false);
    setName("");
    setFehler(null);
    setAngelegt(null);
  }

  function speichern() {
    if (pending) return;
    setFehler(null);
    startTransition(async () => {
      try {
        const res = await createEmployee(name);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setAngelegt({
          name: name.trim(),
          einladung: {
            url: res.url,
            qr: res.qr,
            expiresAt: res.expiresAt,
          },
        });
      } catch {
        setFehler("Der Mitarbeiter konnte nicht angelegt werden.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Neuer Mitarbeiter
      </button>

      {offen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) schliessen();
          }}
        >
          <div className="rounded-xl border border-line bg-surface w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-sm font-semibold text-ink">
                {angelegt
                  ? `${angelegt.name} ist angelegt`
                  : "Neuer Mitarbeiter"}
              </h2>
              <button
                type="button"
                onClick={schliessen}
                disabled={pending}
                className="h-8 w-8 -mr-2 inline-flex items-center justify-center rounded-md text-sub hover:text-ink disabled:opacity-50"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {angelegt ? (
              <div className="p-5 space-y-4">
                <EinladungAnzeige
                  name={angelegt.name}
                  einladung={angelegt.einladung}
                />
                <div className="flex justify-end pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={schliessen}
                    className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90"
                  >
                    Fertig
                  </button>
                </div>
              </div>
            ) : (
            <form
              className="p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                speichern();
              }}
            >
              <div>
                <label
                  htmlFor="mitarbeiter-name"
                  className="block text-[11px] font-medium text-sub mb-1"
                >
                  Name
                </label>
                <input
                  id="mitarbeiter-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Markus Mustermann"
                  maxLength={80}
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <p className="text-xs text-sub mt-1">
                  Der Name muss eindeutig sein und erscheint später auf dem
                  Stempel-Handy. Im nächsten Schritt bekommst du den
                  Einrichtungs-Link zum Verschicken.
                </p>
              </div>

              {fehler && <p className="text-xs text-err">{fehler}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={schliessen}
                  disabled={pending}
                  className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={pending || !name.trim()}
                  className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Wird angelegt …" : "Anlegen"}
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
