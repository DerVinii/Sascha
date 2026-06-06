"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Square } from "lucide-react";
import { enrichBatchAction } from "../actions";

const BATCH_SIZE = 4;

export function EnrichPanel({ initialPending }: { initialPending: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [running, setRunning] = useState(false);
  const [enriched, setEnriched] = useState(0);
  const [notFound, setNotFound] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function run() {
    setError(null);
    setEnriched(0);
    setNotFound(0);
    setFailed(0);
    setRunning(true);
    stopRef.current = false;

    try {
      // Schleife: Charge für Charge, bis nichts mehr offen ist oder gestoppt.
      // Jeder Aufruf bleibt kurz → Free-Tier-tauglich.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stopRef.current) break;
        const r = await enrichBatchAction({ limit: BATCH_SIZE });
        setEnriched((v) => v + r.enriched);
        setNotFound((v) => v + r.notFound);
        setFailed((v) => v + r.failed);
        setPending(r.remaining);
        if (r.processed === 0 || r.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setRunning(false);
      stopRef.current = false;
      router.refresh();
    }
  }

  function stop() {
    stopRef.current = true;
  }

  const processed = enriched + notFound + failed;

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Leads anreichern</h3>
        <p className="text-xs text-sub mt-0.5">
          Findet zu jedem gescrapten Lead den Geschäftsführer (Vor-/Nachname) und
          die E-Mail-Adresse via Gemini + Google-Suche. Läuft in Chargen von{" "}
          {BATCH_SIZE}.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!running ? (
          <button
            onClick={run}
            disabled={pending === 0}
            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {pending === 0 ? "Nichts offen" : `${pending} Leads anreichern`}
          </button>
        ) : (
          <button
            onClick={stop}
            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
          >
            <Square className="h-3.5 w-3.5" />
            Stoppen
          </button>
        )}

        {running && (
          <span className="inline-flex items-center gap-1.5 text-sm text-sub">
            <Loader2 className="h-4 w-4 animate-spin" />
            läuft … {pending} offen
          </span>
        )}
      </div>

      {(processed > 0 || running) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="text-ok">{enriched} angereichert</span>
          <span className="text-sub">{notFound} nicht gefunden</span>
          {failed > 0 && <span className="text-err">{failed} Fehler</span>}
          <span className="text-sub">· {pending} offen</span>
        </div>
      )}

      {error && <p className="text-sm text-err">{error}</p>}
    </div>
  );
}
