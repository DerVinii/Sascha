"use client";

import { useState, useTransition } from "react";
import { X, Settings2 } from "lucide-react";
import type {
  LeadColumn,
  LeadColumnConfig,
  OnlyRunIf,
} from "@/lib/scraping-types";

type Props = {
  open: boolean;
  onClose: () => void;
  column: LeadColumn | null;
  onSave: (config: LeadColumnConfig) => Promise<void>;
};

const ONLY_RUN_IF: { value: OnlyRunIf; label: string }[] = [
  { value: "always", label: "Immer ausführen" },
  { value: "name_empty", label: "Nur wenn Name leer" },
  { value: "email_empty", label: "Nur wenn E-Mail leer" },
];

export function ColumnConfigModal({ open, onClose, column, onSave }: Props) {
  const [pending, startTransition] = useTransition();
  const [onlyRunIf, setOnlyRunIf] = useState<OnlyRunIf>(
    column?.config.runSettings?.onlyRunIf ?? "always",
  );
  const [autoUpdate, setAutoUpdate] = useState<boolean>(
    column?.config.runSettings?.autoUpdate ?? false,
  );

  if (!open || !column) return null;

  function save() {
    if (!column) return;
    const config: LeadColumnConfig = {
      ...column.config,
      runSettings: { autoUpdate, onlyRunIf },
    };
    startTransition(async () => {
      await onSave(config);
      onClose();
    });
  }

  const inputs = Object.entries(column.config.inputs ?? {});
  const providers = column.config.provider ?? ["gemini"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold text-ink">
              Run-Einstellungen — {column.label}
            </h3>
          </div>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-sub mb-1.5">
              Provider (Waterfall)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {providers.map((p) => (
                <span
                  key={p}
                  className="text-xs px-2 py-0.5 rounded bg-bg text-ink border border-line capitalize"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {inputs.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-sub mb-1.5">
                Inputs
              </div>
              <div className="space-y-1">
                {inputs.map(([label, path]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-ink">{label}</span>
                    <code className="text-sub bg-bg px-1.5 py-0.5 rounded">
                      /{path}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-sub">Only run if</span>
            <select
              value={onlyRunIf}
              onChange={(e) => setOnlyRunIf(e.target.value as OnlyRunIf)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none"
            >
              {ONLY_RUN_IF.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-sub">
              Spart Provider-Aufrufe — Zeilen, die die Bedingung nicht erfüllen,
              werden bei „Fehlende ausführen" übersprungen.
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoUpdate}
              onChange={(e) => setAutoUpdate(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            <span className="text-sm text-ink">Auto-update</span>
            <span className="text-[11px] text-sub">
              (Phase 2 — läuft künftig automatisch bei neuen Zeilen)
            </span>
          </label>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-sub hover:text-ink"
          >
            Abbrechen
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="h-9 px-4 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {pending ? "Speichern …" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
