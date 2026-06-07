"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { addManualLeadAction } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  onAdded: () => void;
};

export function ManualLeadModal({ open, onClose, listId, onAdded }: Props) {
  const [firma, setFirma] = useState("");
  const [webseite, setWebseite] = useState("");
  const [telefon, setTelefon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await addManualLeadAction({ listId, firma, webseite, telefon });
        setFirma("");
        setWebseite("");
        setTelefon("");
        onAdded();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler.");
      }
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
      <div className="w-full max-w-md rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">Lead manuell hinzufügen</h3>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-sub">Firma *</span>
            <input
              autoFocus
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sub">Webseite</span>
            <input
              value={webseite}
              onChange={(e) => setWebseite(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sub">Telefon</span>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          {error && <p className="text-sm text-err">{error}</p>}
          <p className="text-[11px] text-sub">
            Name & E-Mail des Geschäftsführers kannst du danach per „Geschäftsführer
            finden" anreichern.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-sub hover:text-ink">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending || !firma.trim()}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "…" : "Hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}
