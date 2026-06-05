"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Settings,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vertrieb", label: "Vertrieb", icon: Megaphone },
  { href: "/crm", label: "CRM", icon: Users },
  { href: "/aufgaben", label: "Aufgaben", icon: ListTodo },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

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

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
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
        })}
      </nav>
    </aside>
  );
}
