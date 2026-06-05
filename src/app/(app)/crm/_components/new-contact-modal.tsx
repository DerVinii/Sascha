"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createContactAction } from "../actions";
import { STATUS_LABELS } from "@/components/crm/status-pill";

export function NewContactModal() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createContactAction(formData);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition shrink-0"
      >
        + Neuer Kontakt
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold">Neuer Kontakt</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field name="firstName" label="Vorname" />
                <Field name="lastName" label="Nachname" />
              </div>
              <Field name="companyName" label="Firma" />
              <div className="grid grid-cols-2 gap-3">
                <Field name="email" label="E-Mail" type="email" />
                <Field name="phone" label="Telefon" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue="lead"
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg"
                >
                  {Object.entries(STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <Field
                name="tags"
                label="Tags (komma-getrennt)"
                placeholder="vip, b2b, deutschland"
              />
              <Field
                name="source"
                label="Quelle"
                placeholder="Kampagne, Empfehlung …"
              />

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
                  {pending ? "Wird erstellt …" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-sub mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
      />
    </div>
  );
}
