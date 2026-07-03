"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadCell as Cell, LeadColumn } from "@/lib/scraping-types";

type Props = {
  column: LeadColumn;
  cell: Cell;
  running?: boolean;
  onRunCell?: () => void;
  onOpenDetails?: () => void;
  onEdit?: (value: string) => void;
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
