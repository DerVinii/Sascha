"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Settings,
  CalendarDays,
  Inbox,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TOP: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vertrieb", label: "Vertrieb", icon: Megaphone },
  { href: "/crm", label: "Kontakte", icon: Users },
];

const BOTTOM: NavItem[] = [
  { href: "/kalender", label: "Kalender", icon: CalendarDays },
];

const BOTTOM_AFTER_POSTFACH: NavItem[] = [
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

const POSTFACH_SUB: { href: string; label: string }[] = [
  { href: "/postfach/unibox", label: "Unibox" },
  { href: "/postfach/accounts", label: "Sending-Accounts" },
];

export type SidebarPipeline = { id: string; name: string };

export function Sidebar({
  orgName,
  pipelines = [],
}: {
  orgName: string;
  pipelines?: SidebarPipeline[];
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="hidden md:flex md:w-60 flex-col bg-sidebar text-slate-300">
      <div className="h-14 flex items-center px-4 border-b border-slate-800">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-700 text-white font-bold text-sm">
          SK
        </div>
        <div className="ml-2.5 min-w-0">
          <div className="text-sm font-semibold text-white leading-tight truncate">
            Kommandozentrale
          </div>
          <div className="text-[10px] text-slate-400 leading-tight truncate">
            {orgName}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {TOP.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {/* Pipelines mit Unterpunkten (wie SalesSuite) */}
        <Link
          href="/pipelines"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition",
            pathname === "/pipelines"
              ? "bg-sidebar-soft text-white"
              : "text-slate-300 hover:bg-sidebar-soft hover:text-white",
          )}
        >
          <Filter className="h-4 w-4" />
          <span className="flex-1">Pipelines</span>
        </Link>
        {pipelines.length > 0 && (
          <div className="ml-4 pl-3 border-l border-slate-800 space-y-0.5 py-0.5">
            {pipelines.map((p) => {
              const active = pathname === `/pipelines/${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={`/pipelines/${p.id}`}
                  className={cn(
                    "block px-3 py-1.5 rounded-md text-[13px] truncate transition",
                    active
                      ? "text-white font-medium"
                      : "text-slate-400 hover:text-white",
                  )}
                  title={p.name}
                >
                  {p.name}
                </Link>
              );
            })}
          </div>
        )}

        {BOTTOM.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {/* Postfach mit Unterpunkten (Unibox + Sending-Accounts) */}
        <NavLink
          item={{ href: "/postfach", label: "Postfach", icon: Inbox }}
          active={isActive("/postfach")}
        />
        <div className="ml-4 pl-3 border-l border-slate-800 space-y-0.5 py-0.5">
          {POSTFACH_SUB.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "block px-3 py-1.5 rounded-md text-[13px] truncate transition",
                pathname === s.href
                  ? "text-white font-medium"
                  : "text-slate-400 hover:text-white",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {BOTTOM_AFTER_POSTFACH.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition",
        active
          ? "bg-sidebar-soft text-white"
          : "text-slate-300 hover:bg-sidebar-soft hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}
