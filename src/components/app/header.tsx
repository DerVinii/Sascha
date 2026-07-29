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
  "/statistik": {
    title: "Statistik",
    desc: "Kampagnen-Kennzahlen aus Instantly – Öffnungen, Antworten, Chancen.",
  },
  "/pipelines": {
    title: "Pipelines",
    desc: "Deals nach Pipelines und Phasen verwalten.",
  },
  "/crm": {
    title: "Kontakte",
    desc: "Alle Kontakte und ihre Kommunikationshistorie.",
  },
  "/kalender": {
    title: "Kalender",
    desc: "Termine, Meetings und gebuchte Calls im Überblick.",
  },
  // Präfix-Match: deckt auch die Unterseiten ab (/zeiterfassung/mitarbeiter,
  // /zeiterfassung/geraete, /zeiterfassung/[id] …).
  "/zeiterfassung": {
    title: "Zeiterfassung",
    desc: "Stempelzeiten, Krankmeldungen und Geräte des Teams.",
  },
  "/postfach/unibox": {
    title: "Unibox",
    desc: "Antworten aus den Instantly-Kampagnen lesen und beantworten.",
  },
  "/postfach/accounts": {
    title: "Sending-Accounts",
    desc: "Status, Warmup und Zustellbarkeit der Instantly-Postfächer.",
  },
  "/postfach": {
    title: "Postfach",
    desc: "Antworten aus dem Cold-Outreach zentral beantworten.",
  },
  "/einstellungen": {
    title: "Einstellungen",
    desc: "Kontaktfelder, Tags, Daten und Darstellung.",
  },
};

function matchTitle(pathname: string) {
  for (const prefix of Object.keys(TITLES)) {
    if (pathname.startsWith(prefix)) return TITLES[prefix];
  }
  return { title: "", desc: "" };
}

export function Header({ mobileNav }: { mobileNav?: React.ReactNode }) {
  const pathname = usePathname();
  const { title, desc } = matchTitle(pathname);

  return (
    // pt-[safe-area-inset-top]: schiebt die Leiste auf dem Handy unter die
    // Statusleiste/Notch (viewport-fit=cover + black-translucent lassen den
    // Inhalt sonst hinter Uhrzeit/Dynamic Island verschwinden). Auf Desktop
    // und Geräten ohne Notch ist der Inset 0 → unverändert.
    <header
      className="bg-surface border-b border-line shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-14 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-1.5 min-w-0">
          {mobileNav}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-ink truncate">{title}</h1>
            <p className="text-[11px] text-sub hidden sm:block truncate">
              {desc}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-ink transition"
            aria-label="Benachrichtigungen"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
