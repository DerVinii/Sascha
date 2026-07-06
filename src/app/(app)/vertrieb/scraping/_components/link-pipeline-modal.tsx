"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Workflow, Loader2, Unlink } from "lucide-react";
import {
  listLinkablePipelinesAction,
  connectPipelineAction,
  disconnectPipelineAction,
  type LinkablePipeline,
} from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  /** Aktuell verbundene Pipeline (für die Kopfzeile). */
  linkedPipelineName: string | null;
  onDone: () => void;
};

export function LinkPipelineModal({
  open,
  onClose,
  listId,
  linkedPipelineName,
  onDone,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<LinkablePipeline[]>([]);
  const [linkedPipelineId, setLinkedPipelineId] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLinkablePipelinesAction({ listId })
      .then((res) => {
        if (cancelled) return;
        setPipelines(res.pipelines);
        setLinkedPipelineId(res.linkedPipelineId);
        // Vorauswahl: verbundene Pipeline, sonst erste vorhandene (n:1 — jede ist
        // wählbar, auch wenn sie schon mit anderen Ordnern verbunden ist).
        if (res.linkedPipelineId) {
          setMode("existing");
          setSelectedId(res.linkedPipelineId);
        } else if (res.pipelines.length > 0) {
          setMode("existing");
          setSelectedId(res.pipelines[0].id);
        } else {
          setMode("new");
        }
        setNewName("");
      })
      .catch(() =>
        !cancelled ? setError("Pipelines konnten nicht geladen werden.") : null,
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, listId]);

  if (!open) return null;

  function connect() {
    setError(null);
    startSaving(async () => {
      try {
        const res =
          mode === "new"
            ? await connectPipelineAction({
                listId,
                newPipelineName: newName.trim(),
              })
            : await connectPipelineAction({ listId, pipelineId: selectedId });
        if (res.error) {
          setError(res.error);
          return;
        }
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verbinden fehlgeschlagen.");
      }
    });
  }

  function disconnect() {
    if (
      !confirm(
        'Verbindung zur Pipeline trennen? Die Deals bleiben in der Pipeline erhalten, die Spalte „Pipeline-Phase" verschwindet.',
      )
    )
      return;
    setError(null);
    startSaving(async () => {
      try {
        await disconnectPipelineAction({ listId });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Trennen fehlgeschlagen.");
      }
    });
  }

  const canSubmit =
    mode === "new" ? newName.trim().length > 0 : selectedId.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Workflow className="h-4 w-4 text-accent" />
            Mit Pipeline verbinden
          </h3>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-sub py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
            </div>
          ) : (
            <>
              {linkedPipelineId && (
                <div className="rounded-md bg-accent-faint border border-accent-line px-3 py-2 text-xs text-accent flex items-center justify-between gap-2">
                  <span className="truncate">
                    Verbunden mit „{linkedPipelineName ?? "Pipeline"}"
                  </span>
                  <button
                    onClick={disconnect}
                    disabled={saving}
                    className="inline-flex items-center gap-1 shrink-0 h-6 px-2 rounded border border-accent-line bg-surface text-accent hover:bg-accent-soft transition disabled:opacity-50"
                  >
                    <Unlink className="h-3 w-3" />
                    Trennen
                  </button>
                </div>
              )}

              {/* Bestehende Pipeline */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pl-mode"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                  className="mt-1"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-ink">
                    Bestehende Pipeline
                  </span>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    onFocus={() => setMode("existing")}
                    disabled={pipelines.length === 0}
                    className="mt-1 w-full h-9 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30 disabled:opacity-50"
                  >
                    {pipelines.length === 0 && (
                      <option value="">Keine Pipeline vorhanden</option>
                    )}
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.linkedOtherCount > 0
                          ? ` — ${p.linkedOtherCount} weitere${
                              p.linkedOtherCount === 1 ? "r" : ""
                            } Ordner verbunden`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {/* Neue Pipeline */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pl-mode"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                  className="mt-1"
                />
                <div className="flex-1 space-y-2">
                  <span className="text-sm font-medium text-ink">
                    Neue Pipeline erstellen
                  </span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onFocus={() => setMode("new")}
                    placeholder="Name der Pipeline …"
                    className="w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
                  />
                </div>
              </label>

              <p className="text-[11px] text-sub">
                Alle Leads dieses Ordners werden als Deals in die Pipeline
                übernommen und bleiben synchron: Hinzufügen & Löschen wirken in
                beide Richtungen. Es erscheint die Spalte „Pipeline-Phase".
                Mehrere Ordner können dieselbe Pipeline speisen — ihre Leads
                werden dort addiert.
              </p>

              {error && <p className="text-sm text-err">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-sub hover:text-ink"
          >
            Abbrechen
          </button>
          <button
            onClick={connect}
            disabled={saving || loading || !canSubmit}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Workflow className="h-4 w-4" />
            )}
            {linkedPipelineId ? "Aktualisieren" : "Verbinden"}
          </button>
        </div>
      </div>
    </div>
  );
}
