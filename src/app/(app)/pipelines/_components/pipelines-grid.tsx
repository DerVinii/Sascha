"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Filter,
  Settings,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { PIPELINE_TEMPLATES } from "@/lib/pipeline-templates";
import { createPipeline, reorderPipeline } from "@/app/(app)/crm/pipeline-actions";
import {
  PipelineManagerModal,
  type ManagerStage,
} from "@/app/(app)/crm/_components/pipeline-manager-modal";

type GridPipeline = {
  id: string;
  name: string;
  dealCount: number;
  stages: ManagerStage[];
};

export function PipelinesGrid({ pipelines }: { pipelines: GridPipeline[] }) {
  const router = useRouter();
  const [reordering, setReordering] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(id: string, dir: "up" | "down") {
    startTransition(async () => {
      await reorderPipeline(id, dir);
      router.refresh();
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-ink">Pipelines</h2>
        <div className="flex items-center gap-2">
          <span className="h-9 px-3 inline-flex items-center rounded-md border border-warn/40 bg-warn/10 text-[13px] font-medium text-warn">
            {pipelines.length} Pipelines
          </span>
          <button
            onClick={() => setReordering((v) => !v)}
            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md border text-sm font-medium transition ${
              reordering
                ? "border-sidebar bg-sidebar text-white"
                : "border-line bg-surface text-ink hover:bg-bg"
            }`}
          >
            <ArrowUpDown className="h-4 w-4" />
            {reordering ? "Fertig" : "Reihenfolge ändern"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pipelines.map((p, i) => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            pipelineCount={pipelines.length}
            reordering={reordering}
            isFirst={i === 0}
            isLast={i === pipelines.length - 1}
            disabled={pending}
            onMove={(dir) => move(p.id, dir)}
            onOpen={() => router.push(`/pipelines/${p.id}`)}
          />
        ))}

        <NewPipelineCard />
      </div>
    </div>
  );
}

function PipelineCard({
  pipeline,
  pipelineCount,
  reordering,
  isFirst,
  isLast,
  disabled,
  onMove,
  onOpen,
}: {
  pipeline: GridPipeline;
  pipelineCount: number;
  reordering: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (dir: "up" | "down") => void;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={reordering ? undefined : onOpen}
      className={`group relative rounded-xl border border-line bg-surface p-5 transition ${
        reordering ? "" : "cursor-pointer hover:border-sub hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Filter className="h-5 w-5" />
        </div>

        <div className="flex items-center gap-2">
          {reordering ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove("up");
                }}
                disabled={disabled || isFirst}
                className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-30"
                aria-label="Nach oben"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove("down");
                }}
                disabled={disabled || isLast}
                className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-30"
                aria-label="Nach unten"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </>
          ) : (
            <PipelineManagerModal
              pipelineId={pipeline.id}
              pipelineName={pipeline.name}
              stages={pipeline.stages}
              pipelineCount={pipelineCount}
              trigger={(open) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    open();
                  }}
                  className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink transition"
                  aria-label="Pipeline-Einstellungen"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-lg font-semibold text-ink truncate">
          {pipeline.name}
        </div>
        <div className="text-sm text-sub mt-0.5">{pipeline.dealCount} Deals</div>
      </div>
    </div>
  );
}

function NewPipelineCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("standard");

  function submit() {
    startTransition(async () => {
      const id = await createPipeline(name, template);
      setOpen(false);
      setName("");
      setTemplate("standard");
      router.push(`/pipelines/${id}`);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border-2 border-dashed border-line bg-transparent p-5 min-h-[140px] flex flex-col items-center justify-center gap-2 text-sub hover:border-sub hover:text-ink transition"
      >
        <Plus className="h-7 w-7" />
        <span className="text-base font-semibold">Pipeline erstellen</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-md shadow-xl max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold">Neue Pipeline</h3>
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-md text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Name
                </label>
                <input
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Kaltakquise Q3"
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Vorlage
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg"
                >
                  {Object.entries(PIPELINE_TEMPLATES).map(([key, t]) => (
                    <option key={key} value={key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-sub mt-1">
                  {PIPELINE_TEMPLATES[template]?.description}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 text-sm text-sub hover:text-ink"
                >
                  Abbrechen
                </button>
                <button
                  onClick={submit}
                  disabled={pending}
                  className="h-9 px-4 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition disabled:opacity-50"
                >
                  {pending ? "Wird erstellt …" : "Anlegen"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
