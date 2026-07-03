"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createDeal } from "../pipeline-actions";

export type PipelineWithStages = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
};

export type ContactOption = {
  id: string;
  name: string;
  companyName: string | null;
};

type Props = {
  pipelines: PipelineWithStages[];
  /** Auswahlliste für den Board-Modus (Kontakt frei wählbar). */
  contacts?: ContactOption[];
  /** Kontakt-Modus: Kontakt ist fest vorgegeben. */
  lockedContact?: ContactOption;
  defaultPipelineId?: string;
  defaultStageId?: string;
  /** Eigener Trigger; Standard ist ein "+ Neuer Deal"-Button. */
  trigger?: (open: () => void) => React.ReactNode;
};

export function NewDealModal({
  pipelines,
  contacts,
  lockedContact,
  defaultPipelineId,
  defaultStageId,
  trigger,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [pipelineId, setPipelineId] = useState(
    defaultPipelineId ?? pipelines[0]?.id ?? "",
  );
  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? pipelines[0],
    [pipelines, pipelineId],
  );
  const [stageId, setStageId] = useState(
    defaultStageId ?? pipelines[0]?.stages[0]?.id ?? "",
  );
  const [contactId, setContactId] = useState(lockedContact?.id ?? "");
  const [contactSearch, setContactSearch] = useState("");

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = contacts ?? [];
    if (!q) return list.slice(0, 50);
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.companyName ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [contacts, contactSearch]);

  function reset(nextPipelineId?: string) {
    const pid = nextPipelineId ?? defaultPipelineId ?? pipelines[0]?.id ?? "";
    setPipelineId(pid);
    const p = pipelines.find((x) => x.id === pid) ?? pipelines[0];
    setStageId(defaultStageId ?? p?.stages[0]?.id ?? "");
    setContactId(lockedContact?.id ?? "");
    setContactSearch("");
    setError(null);
  }

  function openModal() {
    reset();
    setOpen(true);
  }

  function onPipelineChange(pid: string) {
    setPipelineId(pid);
    const p = pipelines.find((x) => x.id === pid);
    setStageId(p?.stages[0]?.id ?? "");
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    const title = String(formData.get("title") ?? "").trim();
    const valueRaw = String(formData.get("valueEur") ?? "").trim();
    const expectedClose = String(formData.get("expectedClose") ?? "").trim();
    const chosenContact = lockedContact?.id ?? contactId ?? "";

    if (!stageId) {
      setError("Bitte eine Phase wählen.");
      return;
    }

    startTransition(async () => {
      try {
        await createDeal({
          contactId: chosenContact || null,
          pipelineId,
          stageId,
          title: title || lockedContact?.name || "Neuer Deal",
          valueEur: valueRaw ? Math.round(Number(valueRaw)) : null,
          expectedClose: expectedClose || null,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Anlegen.");
      }
    });
  }

  return (
    <>
      {trigger ? (
        trigger(openModal)
      ) : (
        <button
          onClick={openModal}
          className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition shrink-0"
        >
          + Neuer Deal
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-lg shadow-xl max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
              <h3 className="text-sm font-semibold">Neuer Deal</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Titel
                </label>
                <input
                  name="title"
                  autoFocus
                  placeholder={lockedContact?.name ?? "z. B. Coaching-Paket"}
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              {/* Kontakt */}
              {lockedContact ? (
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Kontakt
                  </label>
                  <div className="h-9 px-2 flex items-center rounded-md border border-line bg-bg text-sm text-ink">
                    {lockedContact.name}
                    {lockedContact.companyName
                      ? ` · ${lockedContact.companyName}`
                      : ""}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Kontakt (optional)
                  </label>
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Kontakt suchen …"
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg mb-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <select
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    size={4}
                    className="w-full px-2 py-1 border border-line rounded-md text-sm bg-bg"
                  >
                    <option value="">— kein Kontakt —</option>
                    {filteredContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.companyName ? ` · ${c.companyName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pipeline + Phase */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Pipeline
                  </label>
                  <select
                    value={pipelineId}
                    onChange={(e) => onPipelineChange(e.target.value)}
                    disabled={pipelines.length <= 1}
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg disabled:opacity-60"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Phase
                  </label>
                  <select
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg"
                  >
                    {(activePipeline?.stages ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Wert (€)
                  </label>
                  <input
                    name="valueEur"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Erwarteter Abschluss
                  </label>
                  <input
                    name="expectedClose"
                    type="date"
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-err">{error}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 text-sm text-sub hover:text-ink"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {pending ? "Wird erstellt …" : "Deal anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
