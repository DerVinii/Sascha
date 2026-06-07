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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-3 rounded-full bg-sidebar text-white shadow-2xl pl-4 pr-2 py-2">
        <span className="text-sm font-medium">
          {count} Zeile{count !== 1 ? "n" : ""} ausgewählt
        </span>
        <button
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-info text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Geschäftsführer finden
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
