"use client";

import { useTransition } from "react";
import { STATUS_LABELS } from "@/components/crm/status-pill";
import type { ContactStatus } from "../../actions";

export function StatusSelect({
  current,
  onChange,
}: {
  current: ContactStatus;
  onChange: (status: ContactStatus) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ContactStatus;
        startTransition(async () => {
          await onChange(next);
        });
      }}
      className="h-8 px-2 text-xs border border-line rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-sidebar/20"
    >
      {Object.entries(STATUS_LABELS).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}
