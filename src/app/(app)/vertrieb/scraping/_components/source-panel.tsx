"use client";

import { useState, useTransition } from "react";
import { X, MapPin, Loader2, Search } from "lucide-react";
import { runSourceAction, type ScrapeResult } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  onImported: (r: ScrapeResult) => void;
};

export function SourcePanel({ open, onClose, listId, onImported }: Props) {
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await runSourceAction({ niche, city, listId });
        if (r.error) {
          setError(r.error);
          return;
        }
        setResult(r);
        onImported(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-md bg-surface shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold text-ink">
              Source: Google Maps
            </h3>
          </div>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <p className="text-xs text-sub">
            Findet Unternehmen über Google Maps und importiert sie als Zeilen.
            Pro Suche bis zu 60 Treffer (Google-Limit); Dubletten werden über die
            Place-ID übersprungen.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-sub">
              Business Type / Branche
            </span>
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="z. B. Personalvermittlung"
              disabled={pending}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30 disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-sub">Standort / Stadt</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="z. B. München"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && niche.trim() && city.trim()) submit();
              }}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30 disabled:opacity-50"
            />
          </label>

          {result && (
            <div className="rounded-md bg-bg p-3 text-sm">
              <span className="font-medium text-ok">
                {result.imported} neue Leads
              </span>
              {result.duplicates > 0 && (
                <span className="text-sub">
                  {" "}
                  · {result.duplicates} Dubletten übersprungen
                </span>
              )}
              {result.found === 0 && (
                <span className="text-sub">
                  Keine Treffer für „{result.query}".
                </span>
              )}
            </div>
          )}
          {error && <p className="text-sm text-err">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-sub hover:text-ink"
          >
            Schließen
          </button>
          <button
            onClick={submit}
            disabled={pending || !niche.trim() || !city.trim()}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {pending ? "Suche läuft …" : "In Tabelle importieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
