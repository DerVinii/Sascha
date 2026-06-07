"use client";

import { useState, useRef, useCallback } from "react";
import { runEnrichmentBatchAction } from "../actions";
import type { RunBatchResult } from "@/lib/scraping-types";

const BATCH = 4; // klein halten → jeder Server-Aufruf bleibt unter dem Free-Tier-Limit

export type RunnerProgress = {
  running: boolean;
  label: string;
  processed: number;
  succeeded: number;
  notFound: number;
  failed: number;
  remaining: number;
};

const ZERO: RunnerProgress = {
  running: false,
  label: "",
  processed: 0,
  succeeded: 0,
  notFound: 0,
  failed: 0,
  remaining: 0,
};

type Callbacks = {
  /** Liste, auf die sich die Runs beziehen. */
  listId: string;
  /** nach jedem Batch (z. B. Tabelle neu laden). */
  onBatch?: (r: RunBatchResult) => void | Promise<void>;
  /** bekannte Zeilen, die gleich laufen (für optimistisches "running"). */
  onBeforeRows?: (rowIds: string[]) => void;
  onError?: (msg: string) => void;
};

/**
 * Treibt Enrichment-Runs Charge für Charge vom Client aus — exakt das
 * Free-Tier-Pattern: jeder Server-Call verarbeitet nur ~4 Zeilen, der Client
 * wiederholt bis nichts mehr offen ist (oder "Stop").
 */
export function useBatchRunner(cb: Callbacks) {
  const [progress, setProgress] = useState<RunnerProgress>(ZERO);
  const stopRef = useRef(false);
  const running = useRef(false);

  const accumulate = useCallback(
    (base: RunnerProgress, r: RunBatchResult): RunnerProgress => ({
      ...base,
      processed: base.processed + r.processed,
      succeeded: base.succeeded + r.succeeded,
      notFound: base.notFound + r.notFound,
      failed: base.failed + r.failed,
      remaining: r.remaining,
    }),
    [],
  );

  const finish = useCallback(() => {
    running.current = false;
    setProgress((p) => ({ ...p, running: false }));
  }, []);

  const loop = useCallback(
    async (
      label: string,
      next: () => Promise<RunBatchResult | null>,
    ): Promise<void> => {
      if (running.current) return;
      running.current = true;
      stopRef.current = false;
      let acc: RunnerProgress = { ...ZERO, running: true, label };
      setProgress(acc);
      try {
        while (!stopRef.current) {
          const r = await next();
          if (!r) break;
          acc = accumulate(acc, r);
          setProgress(acc);
          await cb.onBatch?.(r);
          if (r.processed === 0 || r.remaining === 0) break;
        }
      } catch (e) {
        cb.onError?.(e instanceof Error ? e.message : "Run fehlgeschlagen.");
      } finally {
        finish();
      }
    },
    [accumulate, cb, finish],
  );

  const runMissing = useCallback(
    (columnKey: string, label = "Anreichern") =>
      loop(label, () =>
        runEnrichmentBatchAction({
          columnKey,
          listId: cb.listId,
          scope: { mode: "missing", limit: BATCH },
        }),
      ),
    [cb.listId, loop],
  );

  const runForce = useCallback(
    (columnKey: string, label = "Neu berechnen (alle)") => {
      let offset = 0;
      return loop(label, async () => {
        const r = await runEnrichmentBatchAction({
          columnKey,
          listId: cb.listId,
          scope: { mode: "force", limit: BATCH, offset },
        });
        offset += r.processed;
        return r;
      });
    },
    [cb.listId, loop],
  );

  const runRows = useCallback(
    (columnKey: string, rowIds: string[], label = "Zellen ausführen") => {
      let rest = [...rowIds];
      cb.onBeforeRows?.(rest);
      return loop(label, async () => {
        if (rest.length === 0) return null;
        const r = await runEnrichmentBatchAction({
          columnKey,
          listId: cb.listId,
          scope: { rowIds: rest, limit: BATCH },
        });
        rest = rest.filter((id) => !r.rowIds.includes(id));
        return r;
      });
    },
    [cb, loop],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { progress, runMissing, runForce, runRows, stop };
}
