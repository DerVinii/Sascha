"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { STATUS_LABELS } from "@/components/crm/status-pill";
import type { ContactStatus } from "../actions";
import { cn } from "@/lib/utils";

const STATUSES: ContactStatus[] = [
  "lead",
  "qualified",
  "in_conversation",
  "meeting_booked",
  "won",
  "lost",
];

export function ContactFilter({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("status") ?? "all";

  function setStatus(s: string) {
    const sp = new URLSearchParams(params);
    if (s === "all") sp.delete("status");
    else sp.set("status", s);
    router.push(`/crm${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterButton
        active={active === "all"}
        onClick={() => setStatus("all")}
        label="Alle"
        count={counts.all}
      />
      {STATUSES.map((s) => (
        <FilterButton
          key={s}
          active={active === s}
          onClick={() => setStatus(s)}
          label={STATUS_LABELS[s]}
          count={counts[s] ?? 0}
        />
      ))}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 text-xs font-medium rounded-md border transition inline-flex items-center gap-1.5",
        active
          ? "bg-sidebar text-white border-sidebar"
          : "bg-surface text-sub border-line hover:text-ink hover:border-sub",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "text-[10px] rounded-full px-1.5",
          active ? "bg-white/20" : "bg-bg",
        )}
      >
        {count}
      </span>
    </button>
  );
}
