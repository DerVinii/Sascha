"use client";

import { useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { toggleActivityAction, deleteActivityAction } from "../actions";

export function ActivityToggle({
  activityId,
  completed,
}: {
  activityId: string;
  completed: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await toggleActivityAction(activityId);
          })
        }
        className={`h-5 w-5 inline-flex items-center justify-center rounded border transition ${
          completed
            ? "bg-ok border-ok text-white"
            : "border-line hover:border-sub"
        }`}
        title={completed ? "Als offen markieren" : "Als erledigt markieren"}
      >
        {completed && <Check className="h-3 w-3" />}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Aufgabe wirklich löschen?")) return;
          startTransition(async () => {
            await deleteActivityAction(activityId);
          });
        }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-err transition disabled:opacity-50"
        title="Löschen"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
