"use client";

import { useTransition } from "react";
import { X, Plus, Sparkles } from "lucide-react";
import type { LeadCell, LeadColumn } from "@/lib/scraping-types";

type Props = {
  open: boolean;
  onClose: () => void;
  column: LeadColumn | null;
  cell: LeadCell | null;
  existingKeys: Set<string>;
  onAddAsColumn: (field: string, label: string) => Promise<void>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CellDetailsDrawer({
  open,
  onClose,
  column,
  cell,
  existingKeys,
  onAddAsColumn,
}: Props) {
  const [pending, startTransition] = useTransition();
  if (!open || !column || !cell) return null;

  const raw = (cell.raw ?? {}) as Record<string, unknown>;
  const fields = Object.entries(raw);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Vollbild-Panel auf dem Handy: Kopfzeile muss an Notch und Home-Indikator
          vorbei (viewport-fit=cover). Desktop-Insets = 0. */}
      <div
        className="h-full w-full max-w-sm bg-surface shadow-2xl flex flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold text-ink">Zell-Details</h3>
          </div>
          {/* p-3/-m-3: 40px Fingerfläche, ohne das Layout zu verändern. */}
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="shrink-0 p-3 -m-3 text-sub hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Meta label="Spalte" value={column.label} />
            <Meta label="Provider" value={cell.provider ?? "—"} />
            <Meta label="Status" value={statusLabel(cell.status)} />
            <Meta
              label="Ausgeführt"
              value={fmtDate(cell.runAt)}
              span
            />
          </div>

          {cell.error && (
            <div className="rounded-md bg-err/10 p-2 text-xs text-err">
              {cell.error}
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wide text-sub mb-1.5">
              Gefundene Felder
            </div>
            {fields.length === 0 ? (
              <p className="text-sm text-sub">Keine strukturierten Daten.</p>
            ) : (
              <div className="divide-y divide-line rounded-md border border-line">
                {fields.map(([k, v]) => {
                  const derivedKey = `${column.key}__${k}`;
                  const exists = existingKeys.has(derivedKey);
                  return (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-sub">{k}</div>
                        <div className="text-sm text-ink truncate">
                          {v == null || v === "" ? "—" : String(v)}
                        </div>
                      </div>
                      <button
                        disabled={exists || pending}
                        onClick={() =>
                          startTransition(async () => {
                            await onAddAsColumn(k, k);
                          })
                        }
                        title={
                          exists
                            ? "Bereits als Spalte vorhanden"
                            : "Als eigene Spalte hinzufügen"
                        }
                        className="shrink-0 inline-flex items-center gap-1 h-9 md:h-7 px-2 rounded-md border border-line text-xs text-ink hover:bg-bg transition disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                        Spalte
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-3" : ""}>
      <div className="text-[11px] text-sub">{label}</div>
      <div className="text-ink truncate">{value}</div>
    </div>
  );
}

function statusLabel(s: string) {
  return (
    {
      success: "Treffer",
      not_found: "Nicht gefunden",
      error: "Fehler",
      running: "Läuft",
      empty: "Leer",
      queued: "Wartet",
    }[s] ?? s
  );
}
