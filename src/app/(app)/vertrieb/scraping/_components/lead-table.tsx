"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MapPin, Plus, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  LeadColumn,
  LeadRow,
  LeadTableData,
  LeadView,
  LeadViewFilter,
} from "@/lib/scraping-types";
import {
  listLeadTableAction,
  createColumnAction,
  updateColumnAction,
  deleteColumnAction,
  addAsColumnAction,
  editCellAction,
} from "../actions";
import { ENRICHMENT_KEY } from "@/lib/scraping-types";
import { useBatchRunner } from "./use-batch-runner";
import { LeadCellView } from "./lead-cell";
import { ColumnHeader } from "./column-header";
import { TableToolbar } from "./table-toolbar";
import { SourcePanel } from "./source-panel";
import { AddColumnPanel, type NewColumnInput } from "./add-column-panel";
import { CellDetailsDrawer } from "./cell-details-drawer";
import { ColumnConfigModal } from "./column-config-modal";
import { AiColumnModal } from "./ai-column-modal";
import { ManualLeadModal } from "./manual-lead-modal";
import { CampaignSetupModal } from "./campaign-setup-modal";
import { BulkRunBar } from "./bulk-run-bar";
import { CsvImportModal } from "../../_components/csv-import-modal";

function isEmptyVal(v: unknown) {
  return v === null || v === undefined || v === "";
}

function matchFilter(row: LeadRow, f: LeadViewFilter): boolean {
  const cell = row.cells[f.columnKey];
  const val = cell?.value;
  const str = val == null ? "" : String(val).toLowerCase();
  switch (f.op) {
    case "is_empty":
      return !cell || cell.status === "empty" || isEmptyVal(val);
    case "not_empty":
      return !!cell && cell.status !== "empty" && !isEmptyVal(val);
    case "contains":
      return str.includes((f.value ?? "").toLowerCase());
    case "equals":
      return str === (f.value ?? "").toLowerCase();
    case "status_is":
      return cell?.status === f.value;
    default:
      return true;
  }
}

const MAX_RENDER = 300; // DOM-Schutz: nicht mehr als so viele Zeilen gleichzeitig rendern

export function LeadTable({ initial }: { initial: LeadTableData }) {
  const listId = initial.listId;
  const [columns, setColumns] = useState<LeadColumn[]>(initial.columns);
  const [rows, setRows] = useState<LeadRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [views, setViews] = useState<LeadView[]>(initial.views);

  const [activeViewId, setActiveViewId] = useState("all");
  const [adHocFilters, setAdHocFilters] = useState<LeadViewFilter[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [sourceOpen, setSourceOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [details, setDetails] = useState<{
    column: LeadColumn;
    row: LeadRow;
  } | null>(null);
  const [configColumn, setConfigColumn] = useState<LeadColumn | null>(null);
  const [aiColumn, setAiColumn] = useState<LeadColumn | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const refreshing = useRef(false);

  // primäre Enrichment-Spalte (für Bulk/Update-cells/Cell-Runs).
  const primaryEnrichment = useMemo(
    () =>
      columns.find((c) => c.key === ENRICHMENT_KEY && c.kind === "enrichment") ??
      columns.find((c) => c.kind === "enrichment") ??
      null,
    [columns],
  );
  const primaryEnrichmentKeyRef = useRef<string | null>(null);
  primaryEnrichmentKeyRef.current = primaryEnrichment?.key ?? null;

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const data = await listLeadTableAction({ listId });
      setColumns(data.columns);
      setRows(data.rows);
      setTotal(data.total);
      setViews(data.views);
      setRunningCells(new Set());
    } finally {
      refreshing.current = false;
    }
  }, [listId]);

  const runner = useBatchRunner({
    listId,
    onBatch: refresh,
    onBeforeRows: (ids) =>
      setRunningCells((prev) => {
        const next = new Set(prev);
        const ek = primaryEnrichmentKeyRef.current;
        ids.forEach((id) => ek && next.add(`${id}:${ek}`));
        return next;
      }),
    onError: setError,
  });

  const visibleColumns = useMemo(
    () =>
      columns
        .filter((c) => !c.hidden)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) || a.position - b.position,
        ),
    [columns],
  );

  const derivedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of columns) {
      if (c.config.derivedFrom)
        s.add(`${c.config.derivedFrom.column}__${c.config.derivedFrom.field}`);
    }
    return s;
  }, [columns]);

  const visibleRows = useMemo(() => {
    const viewFilters =
      views.find((v) => v.id === activeViewId)?.filters ?? [];
    const all = [...viewFilters, ...adHocFilters];
    const q = search.trim().toLowerCase();

    let out = rows.filter((r) => {
      if (!all.every((f) => matchFilter(r, f))) return false;
      if (q) {
        const hit = Object.values(r.cells).some((c) =>
          String(c.value ?? "")
            .toLowerCase()
            .includes(q),
        );
        if (!hit) return false;
      }
      return true;
    });

    if (sort) {
      out = [...out].sort((a, b) => {
        const av = a.cells[sort.key]?.value ?? "";
        const bv = b.cells[sort.key]?.value ?? "";
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "de");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, views, activeViewId, adHocFilters, search, sort]);

  // --- Run-Handler ---------------------------------------------------------
  const runColumn = (columnKey: string, mode: "missing" | "force") => {
    setError(null);
    if (mode === "force") {
      if (
        !confirm(
          `Wirklich ALLE ${total} Zeilen neu berechnen? Das verbraucht entsprechend viele Gemini-Aufrufe.`,
        )
      )
        return;
      runner.runForce(columnKey, "Neu berechnen");
    } else {
      runner.runMissing(columnKey, "Anreichern");
    }
  };

  const runCell = (columnKey: string, rowId: string) => {
    setError(null);
    runner.runRows(columnKey, [rowId], "Zelle ausführen");
  };

  const runSelection = () => {
    if (!primaryEnrichment || selection.size === 0) return;
    setError(null);
    runner.runRows(
      primaryEnrichment.key,
      [...selection],
      "Auswahl anreichern",
    );
    setSelection(new Set());
  };

  const updateCells = () => {
    if (!primaryEnrichment) return;
    setError(null);
    runner.runMissing(primaryEnrichment.key, "Update cells");
  };

  // --- Spalten-Handler -----------------------------------------------------
  const patchColumn = async (id: string, patch: Partial<LeadColumn>) => {
    await updateColumnAction({ id, patch });
    await refresh();
  };
  const onCreateColumn = async (input: NewColumnInput) => {
    await createColumnAction(input);
    await refresh();
  };
  const onDeleteColumn = async (id: string) => {
    if (!confirm("Spalte löschen?")) return;
    await deleteColumnAction({ id });
    await refresh();
  };
  const onAddAsColumn = async (field: string, label: string) => {
    if (!details) return;
    await addAsColumnAction({
      sourceColumnKey: details.column.key,
      field,
      label,
    });
    await refresh();
  };
  const onEditCell = async (rowId: string, columnKey: string, value: string) => {
    await editCellAction({ rowId, columnKey, value });
    await refresh();
  };

  // --- Selektion -----------------------------------------------------------
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selection.has(r.id));
  const toggleAll = () =>
    setSelection(
      allVisibleSelected ? new Set() : new Set(visibleRows.map((r) => r.id)),
    );
  const toggleRow = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tableWidth =
    44 + visibleColumns.reduce((w, c) => w + c.width, 0) + 44;

  return (
    <div className="space-y-3">
      <TableToolbar
        views={views}
        activeViewId={activeViewId}
        onSelectView={setActiveViewId}
        columns={columns}
        filters={adHocFilters}
        onAddFilter={(f) => setAdHocFilters((p) => [...p, f])}
        onRemoveFilter={(i) =>
          setAdHocFilters((p) => p.filter((_, idx) => idx !== i))
        }
        search={search}
        onSearch={setSearch}
        total={total}
        shown={visibleRows.length}
        onOpenSource={() => setSourceOpen(true)}
        onOpenCsv={() => setCsvOpen(true)}
        onAddManual={() => setManualOpen(true)}
        onAddColumn={() => setAddColumnOpen(true)}
        onUpdateCells={updateCells}
        onSetupCampaign={() => setCampaignOpen(true)}
        exportHref="/api/crm/export?status=lead"
        progress={runner.progress}
        onStop={runner.stop}
      />

      {error && (
        <div className="rounded-md bg-err/10 px-3 py-2 text-sm text-err">
          {error}
        </div>
      )}

      {total === 0 ? (
        <EmptyState onOpenSource={() => setSourceOpen(true)} />
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-auto">
          <table
            className="border-collapse text-sm"
            style={{ width: tableWidth }}
          >
            <thead className="sticky top-0 z-10 bg-bg">
              <tr className="border-b border-line">
                <th className="w-11 px-0 py-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-line"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className="px-2 py-1.5 text-left border-l border-line align-middle"
                    style={{ width: col.width }}
                  >
                    <ColumnHeader
                      column={col}
                      sortDir={sort?.key === col.key ? sort.dir : null}
                      onSort={(dir) => setSort({ key: col.key, dir })}
                      onRename={(label) => patchColumn(col.id, { label })}
                      onRunColumn={(mode) => runColumn(col.key, mode)}
                      onSetColor={(color) => patchColumn(col.id, { color })}
                      onToggleHide={() => patchColumn(col.id, { hidden: true })}
                      onDelete={() => onDeleteColumn(col.id)}
                      onEditConfig={
                        col.kind === "enrichment" && col.config.provider
                          ? () => setConfigColumn(col)
                          : undefined
                      }
                      onAiFill={() => setAiColumn(col)}
                    />
                  </th>
                ))}
                <th className="w-11 px-0 border-l border-line">
                  <button
                    onClick={() => setAddColumnOpen(true)}
                    title="Spalte hinzufügen"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-sub hover:bg-surface hover:text-ink"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.slice(0, MAX_RENDER).map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-line hover:bg-bg/60 transition",
                    selection.has(row.id) && "bg-info/5",
                  )}
                >
                  <td className="px-0 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selection.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="h-3.5 w-3.5 rounded border-line"
                    />
                  </td>
                  {visibleColumns.map((col) => {
                    const cell = row.cells[col.key] ?? {
                      value: null,
                      status: "empty" as const,
                    };
                    return (
                      <td
                        key={col.id}
                        className="px-2 h-9 border-l border-line align-middle overflow-hidden"
                        style={{ width: col.width, maxWidth: col.width }}
                      >
                        <LeadCellView
                          column={col}
                          cell={cell}
                          running={runningCells.has(`${row.id}:${col.key}`)}
                          onRunCell={
                            col.kind === "enrichment"
                              ? () => runCell(col.key, row.id)
                              : undefined
                          }
                          onOpenDetails={
                            col.kind === "enrichment"
                              ? () => setDetails({ column: col, row })
                              : undefined
                          }
                          onEdit={
                            cell.editable
                              ? (v) => onEditCell(row.id, col.key, v)
                              : undefined
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-line" />
                </tr>
              ))}
            </tbody>
          </table>

          {visibleRows.length === 0 && (
            <div className="p-8 text-center text-sm text-sub">
              Keine Zeilen für diese Ansicht/Filter.
            </div>
          )}
          {visibleRows.length > MAX_RENDER && (
            <div className="p-3 text-center text-xs text-sub border-t border-line">
              Zeige {MAX_RENDER} von {visibleRows.length} Zeilen — nutze Filter
              oder Views, um einzugrenzen.
            </div>
          )}
        </div>
      )}

      <BulkRunBar
        count={selection.size}
        onRun={runSelection}
        onClear={() => setSelection(new Set())}
        disabled={runner.progress.running || !primaryEnrichment}
      />

      <SourcePanel
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        listId={listId}
        onImported={() => refresh()}
      />
      <CsvImportModal
        listId={listId}
        open={csvOpen}
        onClose={() => {
          setCsvOpen(false);
          refresh();
        }}
      />
      <ManualLeadModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        listId={listId}
        onAdded={() => refresh()}
      />
      <CampaignSetupModal
        open={campaignOpen}
        onClose={() => setCampaignOpen(false)}
        listId={listId}
        listName={initial.listName}
        columns={columns}
        onDone={refresh}
      />
      <AddColumnPanel
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
        onCreate={onCreateColumn}
      />
      <CellDetailsDrawer
        open={!!details}
        onClose={() => setDetails(null)}
        column={details?.column ?? null}
        cell={details ? details.row.cells[details.column.key] ?? null : null}
        existingKeys={derivedKeys}
        onAddAsColumn={onAddAsColumn}
      />
      <ColumnConfigModal
        key={`cfg-${configColumn?.id ?? "none"}`}
        open={!!configColumn}
        onClose={() => setConfigColumn(null)}
        column={configColumn}
        onSave={async (config) => {
          if (configColumn) await patchColumn(configColumn.id, { config });
        }}
      />
      <AiColumnModal
        key={`ai-${aiColumn?.id ?? "none"}`}
        open={!!aiColumn}
        onClose={() => setAiColumn(null)}
        column={aiColumn}
        columns={columns}
        onSave={async (prompt, run) => {
          if (!aiColumn) return;
          await patchColumn(aiColumn.id, {
            config: { ...aiColumn.config, ai: { prompt } },
          });
          if (run) {
            setError(null);
            runner.runMissing(aiColumn.key, "KI ausfüllen");
          }
        }}
      />
    </div>
  );
}

function EmptyState({ onOpenSource }: { onOpenSource: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg">
        <Radar className="h-6 w-6 text-info" />
      </div>
      <h3 className="text-sm font-semibold text-ink">
        Diese Kampagne hat noch keine Leads
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-sub">
        Füll diese Kampagne: per Google-Maps-Scrape, CSV-Import oder manuell
        (Buttons oben). Danach reicherst du die Leads mit „Geschäftsführer finden"
        an.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          onClick={onOpenSource}
          className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
        >
          <MapPin className="h-4 w-4" />
          Google Maps durchsuchen
        </button>
      </div>
    </div>
  );
}
