"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { STAGE_COLORS } from "@/lib/pipeline-templates";
import {
  renamePipeline,
  deletePipeline,
  addStage,
  updateStage,
  moveStage,
  deleteStage,
} from "../pipeline-actions";

export type ManagerStage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  color: string | null;
  dealCount: number;
};

type Props = {
  pipelineId: string;
  pipelineName: string;
  stages: ManagerStage[];
  pipelineCount: number;
  trigger: (open: () => void) => React.ReactNode;
};

export function PipelineManagerModal({
  pipelineId,
  pipelineName,
  stages,
  pipelineCount,
  trigger,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setNewStage("");
        setOpen(true);
      })}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
              <h3 className="text-sm font-semibold">Pipeline verwalten</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Pipeline-Name */}
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Pipeline-Name
                </label>
                <input
                  key={`name-${pipelineName}`}
                  defaultValue={pipelineName}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== pipelineName)
                      run(() => renamePipeline(pipelineId, v));
                  }}
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
                />
              </div>

              {/* Phasen */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-sub uppercase tracking-wide">
                    Phasen
                  </span>
                  <span className="text-[10px] text-sub">
                    Wahrscheinlichkeit in %
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {stages.map((s, i) => (
                    <StageRow
                      key={`${s.id}:${s.name}:${s.color}:${s.probability}`}
                      stage={s}
                      isFirst={i === 0}
                      isLast={i === stages.length - 1}
                      disabled={pending}
                      onMove={(dir) => run(() => moveStage(s.id, dir))}
                      onDelete={() => run(() => deleteStage(s.id))}
                      onName={(name) =>
                        run(() => updateStage(s.id, { name }))
                      }
                      onColor={(color) =>
                        run(() => updateStage(s.id, { color }))
                      }
                      onProb={(probability) =>
                        run(() => updateStage(s.id, { probability }))
                      }
                    />
                  ))}
                </ul>

                {/* Phase hinzufügen */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    placeholder="Neue Phase …"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newStage.trim()) {
                        run(() => addStage(pipelineId, newStage));
                        setNewStage("");
                      }
                    }}
                    className="flex-1 h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
                  />
                  <button
                    onClick={() => {
                      if (newStage.trim()) {
                        run(() => addStage(pipelineId, newStage));
                        setNewStage("");
                      }
                    }}
                    disabled={pending || !newStage.trim()}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Phase
                  </button>
                </div>
              </div>

              {error && <p className="text-xs text-err">{error}</p>}

              {/* Pipeline löschen */}
              <div className="pt-3 border-t border-line flex items-center justify-between">
                <p className="text-[11px] text-sub">
                  {pipelineCount <= 1
                    ? "Letzte Pipeline – nicht löschbar."
                    : "Löscht die Pipeline samt aller Phasen & Deals."}
                </p>
                <button
                  disabled={pending || pipelineCount <= 1}
                  onClick={() => {
                    if (
                      confirm(
                        `Pipeline "${pipelineName}" mit allen Deals wirklich löschen?`,
                      )
                    ) {
                      run(() => deletePipeline(pipelineId));
                      setOpen(false);
                    }
                  }}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-err text-sm font-medium hover:bg-err/10 transition disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                  Pipeline löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StageRow({
  stage,
  isFirst,
  isLast,
  disabled,
  onMove,
  onDelete,
  onName,
  onColor,
  onProb,
}: {
  stage: ManagerStage;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
  onName: (name: string) => void;
  onColor: (color: string) => void;
  onProb: (probability: number) => void;
}) {
  const [palette, setPalette] = useState(false);

  return (
    <li className="flex items-center gap-1.5 rounded-md border border-line bg-bg/40 px-2 py-1.5">
      <div className="flex flex-col">
        <button
          onClick={() => onMove("up")}
          disabled={disabled || isFirst}
          className="text-sub hover:text-ink disabled:opacity-20"
          aria-label="Nach oben"
        >
          <ArrowUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => onMove("down")}
          disabled={disabled || isLast}
          className="text-sub hover:text-ink disabled:opacity-20"
          aria-label="Nach unten"
        >
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>

      {/* Farbe */}
      <div className="relative">
        <button
          onClick={() => setPalette((v) => !v)}
          className="h-6 w-6 rounded-full border border-line shrink-0"
          style={{ background: stage.color ?? "#e2e8f0" }}
          aria-label="Farbe wählen"
        />
        {palette && (
          <div className="absolute z-10 top-7 left-0 bg-surface border border-line rounded-md p-1.5 shadow-lg grid grid-cols-5 gap-1 w-[140px]">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onColor(c);
                  setPalette(false);
                }}
                className="h-5 w-5 rounded-full border border-line"
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        )}
      </div>

      <input
        defaultValue={stage.name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== stage.name) onName(v);
        }}
        disabled={disabled}
        className="flex-1 h-8 px-2 border border-line rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
      />

      <input
        type="number"
        min="0"
        max="100"
        defaultValue={stage.probability}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value));
          if (!Number.isNaN(v) && v !== stage.probability) onProb(v);
        }}
        disabled={disabled}
        className="w-14 h-8 px-1.5 border border-line rounded-md text-sm bg-surface text-center"
        aria-label="Wahrscheinlichkeit"
      />

      <button
        onClick={onDelete}
        disabled={disabled}
        title={
          stage.dealCount > 0
            ? `${stage.dealCount} Deal(s) – erst verschieben`
            : "Phase löschen"
        }
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
