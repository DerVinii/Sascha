"use client";

import { useState } from "react";
import {
  MapPin,
  Plus,
  Sparkles,
  Download,
  Search,
  Filter,
  X,
  Loader2,
  Square,
  Upload,
  UserPlus,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FilterOp,
  LeadColumn,
  LeadView,
  LeadViewFilter,
} from "@/lib/scraping-types";
import type { RunnerProgress } from "./use-batch-runner";

const OPS: { value: FilterOp; label: string }[] = [
  { value: "not_empty", label: "ist gefüllt" },
  { value: "is_empty", label: "ist leer" },
  { value: "contains", label: "enthält" },
  { value: "equals", label: "ist gleich" },
  { value: "status_is", label: "Status ist" },
];

const STATUSES = ["success", "not_found", "error", "empty"];

type Props = {
  views: LeadView[];
  activeViewId: string;
  onSelectView: (id: string) => void;
  columns: LeadColumn[];
  filters: LeadViewFilter[];
  onAddFilter: (f: LeadViewFilter) => void;
  onRemoveFilter: (index: number) => void;
  search: string;
  onSearch: (s: string) => void;
  total: number;
  shown: number;
  onOpenSource: () => void;
  onOpenCsv: () => void;
  onAddManual: () => void;
  onAddColumn: () => void;
  onUpdateCells: () => void;
  onSetupCampaign: () => void;
  exportHref: string;
  progress: RunnerProgress;
  onStop: () => void;
  /** Hintergrund-Enrichment ("Update cells") aktiv + noch offene Zeilen. */
  bgActive: boolean;
  bgPending: number;
};

export function TableToolbar(props: Props) {
  const {
    views,
    activeViewId,
    onSelectView,
    columns,
    filters,
    onAddFilter,
    onRemoveFilter,
    search,
    onSearch,
    total,
    shown,
    onOpenSource,
    onOpenCsv,
    onAddManual,
    onAddColumn,
    onUpdateCells,
    onSetupCampaign,
    exportHref,
    progress,
    onStop,
    bgActive,
    bgPending,
  } = props;

  const labelFor = (key: string) =>
    columns.find((c) => c.key === key)?.label ?? key;

  return (
    <div className="space-y-2">
      {/* Zeile 1: Views + Aktionen */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelectView(v.id)}
              className={cn(
                "h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition",
                activeViewId === v.id
                  ? "bg-brand text-white"
                  : "text-sub hover:bg-bg hover:text-ink",
              )}
            >
              {v.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenSource}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
          >
            <MapPin className="h-3.5 w-3.5 text-info" />
            <span className="hidden sm:inline">Scrapen</span>
          </button>
          <button
            onClick={onOpenCsv}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
            title="CSV importieren"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Import</span>
          </button>
          <button
            onClick={onAddManual}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
            title="Lead manuell hinzufügen"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Manuell</span>
          </button>
          <button
            onClick={onUpdateCells}
            disabled={progress.running || bgActive}
            title={
              bgActive
                ? "Anreicherung läuft bereits im Hintergrund"
                : "Vorname, Nachname & E-Mail für offene Zeilen finden"
            }
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
          >
            {bgActive ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Update cells</span>
          </button>
          <button
            onClick={onSetupCampaign}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
            title="Kampagne einrichten: Copy schreiben & Leads an Instantly senden"
          >
            <Send className="h-3.5 w-3.5 text-info" />
            <span className="hidden sm:inline">Kampagne einrichten</span>
          </button>
          <a
            href={exportHref}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
            title="Als CSV exportieren"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={onAddColumn}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add enrichment</span>
          </button>
        </div>
      </div>

      {/* Zeile 2: Filter + Suche + Count/Progress */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPopover columns={columns} onAdd={onAddFilter} />

        {filters.map((f, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md bg-bg border border-line text-xs text-ink"
          >
            <span className="text-sub">{labelFor(f.columnKey)}</span>
            <span>{OPS.find((o) => o.value === f.op)?.label}</span>
            {f.value && <span className="font-medium">{f.value}</span>}
            <button
              onClick={() => onRemoveFilter(i)}
              className="ml-0.5 text-sub hover:text-err"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sub" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Suchen …"
            className="h-7 pl-7 pr-2 w-40 rounded-md border border-line bg-surface text-xs text-ink placeholder:text-sub focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs">
          {progress.running ? (
            <div className="flex items-center gap-2 text-info">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                {progress.label}: {progress.processed} verarbeitet ·{" "}
                {progress.succeeded} ✓ · {progress.notFound} —
                {progress.failed > 0 && ` · ${progress.failed} ⚠`} ·{" "}
                {progress.remaining} offen
              </span>
              <button
                onClick={onStop}
                className="inline-flex items-center gap-1 h-9 md:h-6 px-3 md:px-2 rounded border border-line text-ink hover:bg-bg"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
            </div>
          ) : bgActive ? (
            <div className="flex items-center gap-2 text-info">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                Anreicherung läuft im Hintergrund
                {bgPending > 0 ? ` · ${bgPending} offen` : " …"}
              </span>
            </div>
          ) : (
            <span className="text-sub">
              {shown === total ? `${total} Zeilen` : `${shown} / ${total}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPopover({
  columns,
  onAdd,
}: {
  columns: LeadColumn[];
  onAdd: (f: LeadViewFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const visible = columns.filter((c) => !c.hidden);
  const [columnKey, setColumnKey] = useState(visible[0]?.key ?? "");
  const [op, setOp] = useState<FilterOp>("not_empty");
  const [value, setValue] = useState("");

  const needsValue = op === "contains" || op === "equals" || op === "status_is";

  function add() {
    if (!columnKey) return;
    onAdd({ columnKey, op, value: needsValue ? value : undefined });
    setValue("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-xs text-ink hover:bg-bg transition"
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 w-72 rounded-lg border border-line bg-surface shadow-xl p-3 space-y-2">
            <select
              value={columnKey}
              onChange={(e) => setColumnKey(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none"
            >
              {visible.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as FilterOp)}
              className="w-full h-8 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none"
            >
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {needsValue &&
              (op === "status_is" ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none"
                >
                  <option value="">Status wählen …</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Wert …"
                  className="w-full h-8 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none"
                />
              ))}
            <button
              onClick={add}
              className="w-full h-8 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
            >
              Filter hinzufügen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
