"use client";

import { useState, useTransition } from "react";
import { X, Wand2 } from "lucide-react";
import type { LeadColumn } from "@/lib/scraping-types";

type Props = {
  open: boolean;
  onClose: () => void;
  column: LeadColumn | null;
  columns: LeadColumn[];
  onSave: (prompt: string, run: boolean) => Promise<void>;
};

export function AiColumnModal({ open, onClose, column, columns, onSave }: Props) {
  const [prompt, setPrompt] = useState(column?.config.ai?.prompt ?? "");
  const [pending, startTransition] = useTransition();

  if (!open || !column) return null;

  // Spalten, die die KI als Kontext sieht (alle außer dieser). System-Spalten
  // wie "Pipeline-Phase" ausschließen: sie existieren serverseitig nicht und
  // stünden dem Modell ohnehin nicht zur Verfügung.
  const refColumns = columns.filter(
    (c) => c.key !== column.key && c.kind !== "action" && !c.config.system,
  );

  function save(run: boolean) {
    const p = prompt.trim();
    if (!p) return;
    startTransition(async () => {
      await onSave(p, run);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold text-ink">
              Mit KI ausfüllen — {column.label}
            </h3>
          </div>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-sub">
            Beschreibe, was die KI pro Zeile finden/erzeugen soll. Sie bekommt die
            Daten der Zeile als Kontext und darf im Web recherchieren. Antwortet mit
            genau einem Wert pro Zelle.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-sub">Prompt</span>
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={
                'z. B. "Finde das LinkedIn-Profil des Geschäftsführers" oder "Fasse zusammen, welche Dienstleistungen die Firma anbietet (max. 5 Wörter)"'
              }
              className="mt-1 w-full px-3 py-2 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30 resize-y"
            />
          </label>

          <div className="rounded-md bg-bg p-3">
            <div className="text-[11px] uppercase tracking-wide text-sub mb-1.5">
              Verfügbarer Zeilen-Kontext
            </div>
            <div className="flex flex-wrap gap-1.5">
              {refColumns.map((c) => (
                <span
                  key={c.key}
                  className="text-[11px] px-2 py-0.5 rounded bg-surface border border-line text-sub"
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-sub">
            Modell: <span className="font-medium text-ink">Gemini 2.5 flash-lite</span>{" "}
            (mit Google-Suche)
          </p>
        </div>

        <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 whitespace-nowrap text-sm text-sub hover:text-ink"
          >
            Abbrechen
          </button>
          <button
            onClick={() => save(false)}
            disabled={pending || !prompt.trim()}
            className="h-9 px-4 whitespace-nowrap rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
          >
            Speichern
          </button>
          <button
            onClick={() => save(true)}
            disabled={pending || !prompt.trim()}
            className="h-9 px-4 whitespace-nowrap rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            {pending ? "…" : "Speichern & ausführen"}
          </button>
        </div>
      </div>
    </div>
  );
}
