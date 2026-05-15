"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createActivityAction } from "../actions";

const TYPE_LABELS = {
  task: "Aufgabe",
  call: "Anruf",
  meeting: "Termin",
  follow_up: "Follow-up",
  note: "Notiz",
};

export function NewActivityModal({
  contactId,
  buttonLabel = "+ Neue Aufgabe",
  buttonClass,
}: {
  contactId?: string;
  buttonLabel?: string;
  buttonClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    if (contactId) formData.set("contactId", contactId);
    startTransition(async () => {
      await createActivityAction(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          buttonClass ??
          "h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition shrink-0"
        }
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold">Neue Aufgabe</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-sub hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Titel *
                </label>
                <input
                  name="title"
                  required
                  autoFocus
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Typ
                  </label>
                  <select
                    name="type"
                    defaultValue="task"
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Fällig am
                  </label>
                  <input
                    name="dueDate"
                    type="datetime-local"
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Notiz (optional)
                </label>
                <textarea
                  name="body"
                  rows={3}
                  className="w-full px-2 py-1.5 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar resize-none"
                />
              </div>

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
                  {pending ? "Speichert …" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
