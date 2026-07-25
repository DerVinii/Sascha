"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarContent, type SidebarPipeline } from "./sidebar";

/**
 * Mobile Navigation: Burger-Button im Header + Drawer von links mit dem
 * kompletten Sidebar-Inhalt. Schließt bei Backdrop-Klick, X und Navigation.
 */
export function MobileNav({
  orgName,
  pipelines = [],
}: {
  orgName: string;
  pipelines?: SidebarPipeline[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Sicherheitsnetz: bei jedem Routenwechsel schließen.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden h-10 w-10 -ml-2 inline-flex items-center justify-center rounded-md text-ink hover:bg-bg transition shrink-0"
        aria-label="Menü öffnen"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col bg-sidebar text-slate-300 shadow-2xl"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-sidebar-soft transition"
              style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
              aria-label="Menü schließen"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent
              orgName={orgName}
              pipelines={pipelines}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
