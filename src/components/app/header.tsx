"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

const TITLES: Record<string, { title: string; desc: string }> = {
  "/dashboard": {
    title: "Dashboard",
    desc: "Übersicht über alle Vertriebs- und CRM-Aktivitäten.",
  },
  "/vertrieb": {
    title: "Vertrieb",
    desc: "Lead-Recherche, Akquise und Cold-Outreach.",
  },
  "/crm": {
    title: "CRM",
    desc: "Kontakte, Pipeline und Kommunikationshistorie.",
  },
  "/einstellungen": {
    title: "Einstellungen",
    desc: "Organisation, Team und externe Integrationen.",
  },
};

function matchTitle(pathname: string) {
  for (const prefix of Object.keys(TITLES)) {
    if (pathname.startsWith(prefix)) return TITLES[prefix];
  }
  return { title: "", desc: "" };
}

export function Header() {
  const pathname = usePathname();
  const { title, desc } = matchTitle(pathname);

  return (
    <header className="h-14 bg-surface border-b border-line flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="min-w-0">
        <h1 className="text-sm font-semibold text-ink truncate">{title}</h1>
        <p className="text-[11px] text-sub hidden sm:block truncate">{desc}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-ink transition"
          aria-label="Benachrichtigungen"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
