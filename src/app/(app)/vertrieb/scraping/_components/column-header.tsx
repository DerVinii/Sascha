"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Type,
  Sparkles,
  Send,
  Database,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Play,
  Zap,
  EyeOff,
  Trash2,
  Settings2,
  Check,
  Wand2,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isUserColumn,
  isPipelineStageColumn,
  isEngineFilledColumn,
  type LeadColumn,
} from "@/lib/scraping-types";

const COLOR_TOKENS: Record<string, string> = {
  info: "text-info",
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  sub: "text-sub",
};

const SWATCHES = [
  { key: null, label: "Standard", cls: "bg-sub/40" },
  { key: "info", label: "Blau", cls: "bg-info" },
  { key: "ok", label: "Grün", cls: "bg-ok" },
  { key: "warn", label: "Gelb", cls: "bg-warn" },
  { key: "err", label: "Rot", cls: "bg-err" },
];

function KindIcon({ column }: { column: LeadColumn }) {
  const cls = cn("h-3.5 w-3.5 shrink-0", column.color && COLOR_TOKENS[column.color]);
  if (column.kind === "enrichment" || column.config.ai)
    return <Sparkles className={cn(cls, !column.color && "text-info")} />;
  if (column.kind === "action") return <Send className={cls} />;
  if (column.kind === "source") return <Database className={cn(cls, "text-sub")} />;
  return <Type className={cls} />;
}

type Props = {
  column: LeadColumn;
  sortDir?: "asc" | "desc" | null;
  onSort: (dir: "asc" | "desc") => void;
  onRename: (label: string) => void;
  onRunColumn: (mode: "missing" | "force") => void;
  onSetColor: (color: string | null) => void;
  onToggleHide: () => void;
  onDelete: () => void;
  onEditConfig?: () => void;
  onAiFill?: () => void;
};

export function ColumnHeader({
  column,
  sortDir,
  onSort,
  onRename,
  onRunColumn,
  onSetColor,
  onToggleHide,
  onDelete,
  onEditConfig,
  onAiFill,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(column.label);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Vorname/Nachname/E-Mail/Anrede werden von einer festen Engine gefüllt und
  // sind deshalb genauso ausführbar wie Email_Entscheider.
  const engineFilled = isEngineFilledColumn(column.key);
  const runnable =
    column.kind === "enrichment" || !!column.config.ai || engineFilled;
  // "Mit KI ausfüllen" für eigene Daten-/KI-Spalten (nicht Source, nicht find_dm)
  // — und nicht für die Engine-Spalten: deren Prompt steht fest.
  const canAi =
    column.kind !== "source" && !column.config.provider && !engineFilled;
  // Umbenennen & Löschen nur bei selbst angelegten Spalten (Standard-Spalten wie
  // Firma/Telefon/Vorname bleiben unverändert).
  const canEditColumn = isUserColumn(column);

  // Menü relativ zum Pfeil-Button per fixed-Position rendern (Portal), sonst
  // würde es vom overflow-auto der Tabelle abgeschnitten (nur die obersten
  // Einträge wären sichtbar).
  const MENU_WIDTH = 208; // w-52
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r)
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - MENU_WIDTH) });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onClose = () => setOpen(false);
    // Beim Scrollen/Resize schließen (fixed-Menü würde sonst „wegdriften").
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  // "Pipeline-Phase": System-Spalte — extra klassifiziert (Akzentfarbe), nicht
  // umbenennen/einfärben/ausblenden/löschen. Kein Kontextmenü.
  if (isPipelineStageColumn(column.key)) {
    return (
      <div
        className="flex items-center gap-1.5 w-full rounded-md bg-accent-faint px-1.5 py-0.5"
        title="Pipeline-Phase — synchron mit der verbundenen Pipeline (nicht bearbeitbar)"
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="flex-1 truncate text-xs font-semibold text-accent">
          {column.label}
        </span>
      </div>
    );
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setRenaming(false);
          if (draft.trim() && draft !== column.label) onRename(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(column.label);
            setRenaming(false);
          }
        }}
        className="w-full h-6 px-1 rounded border border-info bg-surface text-xs font-medium text-ink focus:outline-none"
      />
    );
  }

  return (
    <div className="relative flex items-center gap-1.5 w-full">
      {/* Symbol (Datenbank/T/Sternchen) nur bei selbst angelegten Spalten —
          feste Standard-Spalten (Firma … Email_Entscheider) tragen keins. */}
      {canEditColumn && <KindIcon column={column} />}
      <span className="flex-1 truncate text-xs font-medium text-ink">
        {column.label}
      </span>
      {sortDir === "asc" && <ArrowUp className="h-3 w-3 text-sub" />}
      {sortDir === "desc" && <ArrowDown className="h-3 w-3 text-sub" />}
      <button
        ref={btnRef}
        onClick={() => {
          if (!open) place();
          setOpen((v) => !v);
        }}
        className="shrink-0 inline-flex h-8 w-8 md:h-5 md:w-5 items-center justify-center rounded text-sub hover:bg-bg hover:text-ink"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open &&
        pos &&
        createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={close} />
          <div
            className="fixed z-[61] w-52 max-h-[70dvh] overflow-auto rounded-lg border border-line bg-surface shadow-xl py-1 text-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            <MenuItem
              icon={<ArrowUp className="h-3.5 w-3.5" />}
              label="Aufsteigend sortieren"
              onClick={() => {
                onSort("asc");
                close();
              }}
            />
            <MenuItem
              icon={<ArrowDown className="h-3.5 w-3.5" />}
              label="Absteigend sortieren"
              onClick={() => {
                onSort("desc");
                close();
              }}
            />
            <Divider />

            {runnable && (
              <>
                <MenuItem
                  icon={<Play className="h-3.5 w-3.5" />}
                  label="Fehlende ausführen"
                  onClick={() => {
                    onRunColumn("missing");
                    close();
                  }}
                />
                <MenuItem
                  icon={<Zap className="h-3.5 w-3.5" />}
                  label="Alle erzwingen (Force)"
                  onClick={() => {
                    onRunColumn("force");
                    close();
                  }}
                />
                {onEditConfig && (
                  <MenuItem
                    icon={<Settings2 className="h-3.5 w-3.5" />}
                    label="Run-Einstellungen"
                    onClick={() => {
                      onEditConfig();
                      close();
                    }}
                  />
                )}
                <Divider />
              </>
            )}

            {canAi && onAiFill && (
              <>
                <MenuItem
                  icon={<Wand2 className="h-3.5 w-3.5 text-info" />}
                  label={column.config.ai ? "KI-Prompt bearbeiten" : "Mit KI ausfüllen"}
                  onClick={() => {
                    onAiFill();
                    close();
                  }}
                />
                <Divider />
              </>
            )}

            {canEditColumn && (
              <MenuItem
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="Umbenennen"
                onClick={() => {
                  setRenaming(true);
                  close();
                }}
              />
            )}

            <div className="px-3 py-1.5">
              <div className="text-[11px] text-sub mb-1">Farbe</div>
              <div className="flex items-center gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s.label}
                    title={s.label}
                    onClick={() => {
                      onSetColor(s.key);
                      close();
                    }}
                    className={cn(
                      "h-6 w-6 md:h-4 md:w-4 rounded-full ring-1 ring-line flex items-center justify-center",
                      s.cls,
                    )}
                  >
                    {column.color === s.key && (
                      <Check className="h-2.5 w-2.5 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <Divider />

            <MenuItem
              icon={<EyeOff className="h-3.5 w-3.5" />}
              label="Ausblenden"
              onClick={() => {
                onToggleHide();
                close();
              }}
            />
            {canEditColumn && (
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="Löschen"
                danger
                onClick={() => {
                  onDelete();
                  close();
                }}
              />
            )}
          </div>
        </>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // py-2.5 auf Touch: ~40px hohe Einträge, ab md wieder kompakt.
        "flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left hover:bg-bg transition",
        danger ? "text-err" : "text-ink",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-line" />;
}
