"use client";

import { Sparkles, X } from "lucide-react";

type Props = {
  count: number;
  onRun: () => void;
  onClear: () => void;
  disabled?: boolean;
};

export function BulkRunBar({ count, onRun, onClear, disabled }: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex justify-center">
      <div className="flex items-center gap-2 sm:gap-3 max-w-full rounded-full bg-sidebar text-white shadow-2xl pl-4 pr-2 py-2">
        <span className="text-sm font-medium whitespace-nowrap">
          <span className="sm:hidden">{count} ausgewählt</span>
          <span className="hidden sm:inline">
            {count} Zeile{count !== 1 ? "n" : ""} ausgewählt
          </span>
        </span>
        <button
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full bg-info text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Geschäftsführer finden</span>
          <span className="sm:hidden">GF finden</span>
        </button>
        <button
          onClick={onClear}
          title="Auswahl aufheben"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-sidebar-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
