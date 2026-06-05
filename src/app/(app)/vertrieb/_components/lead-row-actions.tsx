"use client";

import { useTransition } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { qualifyLeadAction, deleteLeadAction } from "../actions";

export function LeadRowActions({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <button
        title="Als qualifiziert markieren"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await qualifyLeadAction(contactId);
          })
        }
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-info transition disabled:opacity-50"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button
        title="Lead löschen"
        disabled={pending}
        onClick={() => {
          if (!confirm("Diesen Lead wirklich löschen?")) return;
          startTransition(async () => {
            await deleteLeadAction(contactId);
          });
        }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-err transition disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
