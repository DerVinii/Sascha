"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setEmployeeActive } from "../../actions";

export type MitarbeiterZeile = {
  id: string;
  name: string;
  active: boolean;
  geraete: number;
};

export function MitarbeiterListe({
  mitarbeiter,
}: {
  mitarbeiter: MitarbeiterZeile[];
}) {
  const [pending, startTransition] = useTransition();
  // Zeile, die gerade geschaltet wird — für den Ladezustand am richtigen Button.
  const [aktiveId, setAktiveId] = useState<string | null>(null);
  const [fehler, setFehler] = useState<{ id: string; text: string } | null>(
    null,
  );
  // Mitarbeiter, für den die Deaktivierung bestätigt werden muss.
  const [bestaetigen, setBestaetigen] = useState<MitarbeiterZeile | null>(null);

  useEffect(() => {
    if (!bestaetigen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setBestaetigen(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bestaetigen, pending]);

  function schalten(m: MitarbeiterZeile, aktiv: boolean) {
    if (pending) return;
    setFehler(null);
    setAktiveId(m.id);
    startTransition(async () => {
      try {
        const res = await setEmployeeActive(m.id, aktiv);
        if (!res.ok) {
          setFehler({ id: m.id, text: res.error });
          return;
        }
        setBestaetigen(null);
      } catch {
        setFehler({
          id: m.id,
          text: "Der Status konnte nicht geändert werden.",
        });
      } finally {
        setAktiveId(null);
      }
    });
  }

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Mitarbeiter</h2>

        {mitarbeiter.length === 0 ? (
          <p className="text-sm text-sub mt-3">
            Noch keine Mitarbeiter angelegt. Lege oben rechts den ersten an.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-sub font-medium text-left">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Geräte</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((m) => {
                  const laeuft = pending && aktiveId === m.id;
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        "border-t border-line",
                        !m.active && "opacity-60",
                      )}
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/zeiterfassung/mitarbeiter/${m.id}`}
                          className="font-medium text-ink hover:text-accent-ink hover:underline underline-offset-4"
                        >
                          {m.name}
                        </Link>
                        {fehler?.id === m.id && (
                          <p className="text-xs text-err mt-1">{fehler.text}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {m.geraete > 0 ? (
                          <span className="tabular-nums text-ink">
                            {m.geraete}
                          </span>
                        ) : (
                          <span
                            className="pill bg-warn/10 text-warn"
                            title="Ohne gekoppeltes Gerät kann nicht gestempelt werden."
                          >
                            Kein Gerät
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "pill",
                            m.active
                              ? "bg-ok/10 text-ok"
                              : "bg-sub/10 text-sub",
                          )}
                        >
                          {m.active ? "aktiv" : "inaktiv"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setFehler(null);
                            if (m.active) setBestaetigen(m);
                            else schalten(m, true);
                          }}
                          className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                        >
                          {laeuft
                            ? "Bitte warten …"
                            : m.active
                              ? "Deaktivieren"
                              : "Aktivieren"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bestaetigen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setBestaetigen(null);
          }}
        >
          <div className="rounded-xl border border-line bg-surface w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-sm font-semibold text-ink">
                Mitarbeiter deaktivieren?
              </h2>
              <button
                type="button"
                onClick={() => setBestaetigen(null)}
                disabled={pending}
                className="h-8 w-8 -mr-2 inline-flex items-center justify-center rounded-md text-sub hover:text-ink disabled:opacity-50"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-ink">
                <span className="font-medium">{bestaetigen.name}</span> kann
                danach nicht mehr stempeln. Dabei werden{" "}
                <span className="font-medium">alle gekoppelten Geräte</span>{" "}
                abgemeldet.
              </p>
              <p className="text-xs text-sub">
                Ein späteres Aktivieren gibt die Geräte nicht wieder frei — der
                Mitarbeiter muss sein Handy dann neu per QR-Code koppeln.
                Bereits erfasste Zeiten bleiben erhalten.
              </p>

              {fehler?.id === bestaetigen.id && (
                <p className="text-xs text-err">{fehler.text}</p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setBestaetigen(null)}
                  disabled={pending}
                  className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => schalten(bestaetigen, false)}
                  disabled={pending}
                  className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Wird deaktiviert …" : "Deaktivieren"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
