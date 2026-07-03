"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

export function DeleteContactButton({
  contactName,
  deleteAction,
}: {
  contactName: string;
  deleteAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition"
        title="Lead löschen"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-xl p-5">
            <h3 className="text-sm font-semibold text-ink">Lead löschen?</h3>
            <p className="text-sm text-sub mt-2">
              Möchtest du{" "}
              <span className="font-medium text-ink">{contactName}</span>{" "}
              wirklich löschen? Zugehörige Notizen und Aktivitäten werden
              ebenfalls entfernt. Diese Aktion kann nicht rückgängig gemacht
              werden.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={() =>
                  startTransition(async () => {
                    await deleteAction();
                  })
                }
                disabled={pending}
                className="h-9 px-4 bg-err text-white text-sm font-medium rounded-md hover:opacity-90 transition disabled:opacity-50"
              >
                {pending ? "Wird gelöscht …" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
