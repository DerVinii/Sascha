"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { scrapeLeadsAction, type ScrapeResult } from "../actions";

export function ScrapeForm() {
  const router = useRouter();
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await scrapeLeadsAction({ niche, city });
        setResult(r);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Neue Leads scrapen</h3>
        <p className="text-xs text-sub mt-0.5">
          Pro Suche liefert Google bis zu 60 Unternehmen. Dubletten werden
          automatisch übersprungen.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-sub">Nische</span>
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="z. B. Personalvermittlung"
            disabled={pending}
            className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sub">Stadt</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="z. B. München"
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && niche.trim() && city.trim()) submit();
            }}
            className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !niche.trim() || !city.trim()}
          className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {pending ? "Suche läuft …" : "Leads scrapen"}
        </button>

        {result && (
          <span className="text-sm text-sub">
            <span className="font-medium text-ok">{result.imported} neu</span>
            {result.duplicates > 0 && <> · {result.duplicates} Dubletten</>}
            {result.found === 0 && <>keine Treffer für „{result.query}"</>}
          </span>
        )}
        {error && <span className="text-sm text-err">{error}</span>}
      </div>
    </div>
  );
}
