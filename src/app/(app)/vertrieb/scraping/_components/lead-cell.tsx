"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Play,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { readableTextColor } from "@/lib/pipeline-templates";
import { menuPosition } from "@/lib/dropdown-position";
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
  // Verhindert doppeltes Speichern (Enter löst commit + danach den Blur-commit aus)
  // und ein versehentliches Speichern nach Escape.
  const committedRef = useRef(false);

  const isEnrichment = column.kind === "enrichment" || !!column.config.ai;
  const isRunning = running || cell.status === "running";
  // Enrichment-/KI-Zellen sind jetzt ebenfalls manuell editierbar (cell.editable
  // wird serverseitig für sie gesetzt) — der grüne Punkt öffnet weiter die Details.
  const editable = !!onEdit && cell.editable;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // --- Pipeline-Phase (eigenes Phasen-Dropdown, kein Text-Edit) ------------
  if (isPipelineStageColumn(column.key)) {
    return <StageDropdown column={column} cell={cell} onSelect={onSelectStage} />;
  }

  function startEdit() {
    if (!editable) return;
    committedRef.current = false;
    setDraft(cell.value == null ? "" : String(cell.value));
    setEditing(true);
  }
  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const current = cell.value == null ? "" : String(cell.value);
    if (draft !== current) onEdit?.(draft);
  }
  function cancelEdit() {
    committedRef.current = true; // Blur nach Escape darf nicht mehr speichern
    setEditing(false);
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
          if (e.key === "Escape") cancelEdit();
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
      <div
        className="group/cell flex items-center justify-between h-full"
        onClick={editable ? startEdit : undefined}
      >
        <span
          className={cn("text-sub", editable && "cursor-text")}
          title={editable ? "Zum Bearbeiten klicken" : "Kein Treffer"}
        >
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
    // Grüner Punkt = Enrichment-Details öffnen; Text = manuell bearbeiten (wie
    // eine normale Zelle). So bleiben beide Aktionen erreichbar.
    return (
      <div className="group/cell flex w-full items-center gap-1.5">
        {onOpenDetails ? (
          // p-2/-m-2: der 6px-Punkt bekommt eine 22px-Fingerfläche, ohne die
          // Zeile zu verändern (negativer Rand hebt das Polster auf).
          <button
            type="button"
            onClick={onOpenDetails}
            title="Enrichment-Details ansehen"
            aria-label="Enrichment-Details ansehen"
            className="shrink-0 -m-2 p-2"
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-ok" />
          </button>
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        )}
        <div
          className={cn(
            "min-w-0 flex-1 truncate",
            editable ? "cursor-text" : "cursor-default",
          )}
          onClick={editable ? startEdit : onOpenDetails}
          title={editable ? "Zum Bearbeiten klicken" : undefined}
        >
          {inner}
        </div>
      </div>
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
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const stages = column.config.pipeline?.stages ?? [];
  const bg = cell.color ?? "#e2e8f0";
  const hasValue = cell.value != null && cell.value !== "";
  // Schriftfarbe automatisch je nach Hintergrund-Helligkeit (dunkel/weiß),
  // damit auch kräftige Phasenfarben lesbar bleiben.
  const fg = readableTextColor(bg);
  const disabled = !onSelect;

  // Menü relativ zum Button per fixed-Position rendern (Portal), sonst würde es
  // vom overflow-hidden der Zelle / overflow-auto der Tabelle abgeschnitten.
  // menuPosition hält es vollständig im Bild — auf dem Handy stand es sonst
  // rechts neben dem Rand (breite Tabelle) oder unten außerhalb.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const m = menuPosition(r, {
      width: Math.max(r.width, 184),
      maxHeight: 256,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    setPos({
      top: m.top,
      left: m.left,
      minWidth: m.width,
      maxHeight: m.maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    // Beim Scrollen/Resize schließen (fixed-Menü würde sonst „wegdriften").
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
        className={cn(
          // py-1.5 auf Touch: die Pille bleibt sonst eine 20px hohe Trefferfläche.
          "inline-flex max-w-full items-center gap-1 rounded-full py-1.5 md:py-0.5 pl-2 pr-1.5 text-xs font-medium disabled:cursor-default",
          !hasValue && "text-slate-500",
        )}
        style={{
          background: hasValue ? bg : "transparent",
          color: hasValue ? fg : undefined,
        }}
        title="Pipeline-Phase ändern"
      >
        <span className="truncate">
          {hasValue ? String(cell.value) : "Phase wählen"}
        </span>
        {!disabled && <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />}
      </button>

      {open &&
        !disabled &&
        pos &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[61] overflow-auto rounded-lg border border-line bg-surface shadow-xl py-1"
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.minWidth,
                maxWidth: "calc(100vw - 1rem)",
                maxHeight: pos.maxHeight,
              }}
            >
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
                      className="flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-sm text-ink hover:bg-bg transition"
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
          </>,
          document.body,
        )}
    </>
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
      className="opacity-100 md:opacity-0 md:group-hover/cell:opacity-100 focus-visible:opacity-100 transition shrink-0 inline-flex h-7 w-7 md:h-5 md:w-5 items-center justify-center rounded bg-brand text-white hover:bg-sidebar-soft"
    >
      <Play className="h-3 w-3" />
    </button>
  );
}
