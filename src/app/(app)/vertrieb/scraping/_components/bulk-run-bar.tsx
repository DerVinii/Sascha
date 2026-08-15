"use client";

import { Sparkles, Trash2, X, Loader2 } from "lucide-react";

type Props = {
  count: number;
  onRun: () => void;
  onDelete: () => void;
  onClear: () => void;
  disabled?: boolean;
  deleting?: boolean;
};

export function BulkRunBar({
  count,
  onRun,
  onDelete,
  onClear,
  disabled,
  deleting,
}: Props) {
  if (count === 0) return null;
  return (
    // bottom per safe-area: auf dem Handy säße die Leiste sonst halb hinter dem
    // Home-Indikator. Auf Desktop ist der Inset 0 → weiterhin 1.5rem.
    <div
      className="fixed inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex justify-center"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2 sm:gap-3 max-w-full rounded-full bg-sidebar text-white shadow-2xl pl-4 pr-2 py-2">
        <span className="text-sm font-medium whitespace-nowrap">
          <span className="sm:hidden">{count} ausgewählt</span>
          <span className="hidden sm:inline">
            {count} Zeile{count !== 1 ? "n" : ""} ausgewählt
          </span>
        </span>
        <button
          onClick={onRun}
          disabled={disabled || deleting}
          className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full bg-info text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Entscheider finden</span>
          <span className="sm:hidden">Entscheider</span>
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Ausgewählte Leads löschen"
          className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full bg-err text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
          )}
          Löschen
        </button>
        <button
          onClick={onClear}
          disabled={deleting}
          title="Auswahl aufheben"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-sidebar-soft disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
