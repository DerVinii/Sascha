"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { List, Columns } from "lucide-react";
import { cn } from "@/lib/utils";

export function ViewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "pipeline" ? "pipeline" : "table";

  function setView(v: "table" | "pipeline") {
    const sp = new URLSearchParams(params);
    if (v === "table") sp.delete("view");
    else sp.set("view", v);
    router.push(`/crm${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  return (
    <div className="inline-flex items-center rounded-md border border-line bg-surface p-0.5">
      <ViewBtn
        active={view === "table"}
        onClick={() => setView("table")}
        icon={<List className="h-3.5 w-3.5" />}
        label="Tabelle"
      />
      <ViewBtn
        active={view === "pipeline"}
        onClick={() => setView("pipeline")}
        icon={<Columns className="h-3.5 w-3.5" />}
        label="Pipeline"
      />
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 text-xs font-medium rounded inline-flex items-center gap-1.5 transition",
        active ? "bg-sidebar text-white" : "text-sub hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
