"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Play,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isPipelineStageColumn,
  type LeadCell as Cell,
  type LeadColumn,
} from "@/lib/scraping-types";

type Props = {
  column: LeadColumn;
  cell: Cell;
  running?: boolean;
  onRunCell?: () => void;
  onOpenDetails?: () => void;
  onEdit?: (value: string) => void;
  /** "Pipeline-Phase"-Zelle: Phase wählen → Deal verschieben. */
  onSelectStage?: (stageId: string) => void;
};

function RatingValue({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-ink">
      <span className="text-warn">★</span>
      {value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
    </span>
  );
}

export function LeadCellView({
  column,
  cell,
  running,
  onRunCell,
  onOpenDetails,
  onEdit,
  onSelectStage,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isEnrichment = column.kind === "enrichment" || !!column.config.ai;
  const isRunning = running || cell.status === "running";
  const editable = !!onEdit && cell.editable && !isEnrichment;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // --- Pipeline-Phase (eigenes Phasen-Dropdown, kein Text-Edit) ------------
  if (isPipelineStageColumn(column.key)) {
    return <StageDropdown column={column} cell={cell} onSelect={onSelectStage} />;
  }

  function startEdit() {
    if (!editable) return;
    setDraft(cell.value == null ? "" : String(cell.value));
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const current = cell.value == null ? "" : String(cell.value);
    if (draft !== current) onEdit?.(draft);
  }

  // --- laufend -------------------------------------------------------------
  if (isRunning) {
    return (
      <div className="flex items-center gap-1.5 text-info">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="h-3 flex-1 rounded bg-line/70 animate-pulse" />
      </div>
    );
  }

  // --- Inline-Edit ---------------------------------------------------------
  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full h-6 px-1 -mx-1 rounded border border-info bg-surface text-sm text-ink focus:outline-none"
      />
    );
  }

  // --- Fehler --------------------------------------------------------------
  if (cell.status === "error") {
    return (
      <button
        onClick={onRunCell}
        title={cell.error ?? "Fehler — klicken zum erneut Ausführen"}
        className="flex items-center gap-1 text-err hover:underline"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs">Fehler</span>
      </button>
    );
  }

  // --- nicht gefunden ------------------------------------------------------
  if (cell.status === "not_found") {
    return (
      <div className="group/cell flex items-center justify-between">
        <span className="text-sub" title="Kein Treffer">
          —
        </span>
        {isEnrichment && onRunCell && (
          <RunDot onClick={onRunCell} title="Erneut versuchen" />
        )}
      </div>
    );
  }

  // --- leer ----------------------------------------------------------------
  if (cell.status === "empty" || cell.value === null || cell.value === "") {
    return (
      <div
        className="group/cell flex items-center justify-between h-full"
        onClick={startEdit}
      >
        <span
          className={cn(
            "text-sub/40",
            editable && "cursor-text w-full",
          )}
        >
          {isEnrichment ? "" : editable ? "" : ""}
        </span>
        {isEnrichment && onRunCell && (
          <RunDot onClick={onRunCell} title="Diese Zeile anreichern" />
        )}
      </div>
    );
  }

  // --- success / Wert ------------------------------------------------------
  const value = cell.value;

  let inner: React.ReactNode;
  if (column.dataType === "rating" && typeof value === "number") {
    inner = <RatingValue value={value} />;
  } else if (column.dataType === "url" && typeof value === "string") {
    const label = value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    inner = (
      <a
        href={value.startsWith("http") ? value : `https://${value}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-info hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate">{label}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    );
  } else if (column.dataType === "checkbox") {
    inner = <span className="text-ink">{value ? "✓" : "—"}</span>;
  } else {
    inner = <span className="truncate text-ink">{String(value)}</span>;
  }

  if (isEnrichment) {
    return (
      <button
        onClick={onOpenDetails}
        className="group/cell flex w-full items-center gap-1.5 text-left hover:underline"
        title="Details ansehen"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        <span className="truncate">{inner}</span>
      </button>
    );
  }

  return (
    <div
      className={cn("truncate", editable && "cursor-text")}
      onClick={editable ? startEdit : undefined}
    >
      {inner}
    </div>
  );
}

/** Farbcodiertes Phasen-Dropdown der "Pipeline-Phase"-Spalte. */
function StageDropdown({
  column,
  cell,
  onSelect,
}: {
  column: LeadColumn;
  cell: Cell;
  onSelect?: (stageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const stages = column.config.pipeline?.stages ?? [];
  // Feste dunkle Schrift: der Hintergrund ist immer eine helle Pastellfarbe aus
  // der DB — text-ink würde im Dunkelmodus hell und damit unlesbar.
  const bg = cell.color ?? "#e2e8f0";
  const hasValue = cell.value != null && cell.value !== "";
  const disabled = !onSelect;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2 pr-1.5 text-xs font-medium text-slate-900 disabled:cursor-default",
          !hasValue && "text-slate-500",
        )}
        style={{ background: hasValue ? bg : "transparent" }}
        title="Pipeline-Phase ändern"
      >
        <span className="truncate">
          {hasValue ? String(cell.value) : "Phase wählen"}
        </span>
        {!disabled && <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />}
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 w-48 rounded-lg border border-line bg-surface shadow-xl py-1">
            {stages.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-sub">Keine Phasen.</div>
            ) : (
              stages.map((s) => {
                const active = cell.stageId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setOpen(false);
                      if (!active) onSelect?.(s.id);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-bg transition"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
                      style={{ background: s.color ?? "#e2e8f0" }}
                    />
                    <span className="flex-1 truncate">{s.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-info" />}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RunDot({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className="opacity-100 md:opacity-0 md:group-hover/cell:opacity-100 focus-visible:opacity-100 transition shrink-0 inline-flex h-5 w-5 items-center justify-center rounded bg-brand text-white hover:bg-sidebar-soft"
    >
      <Play className="h-3 w-3" />
    </button>
  );
}
