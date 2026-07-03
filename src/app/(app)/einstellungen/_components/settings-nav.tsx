"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TextCursorInput,
  Tags,
  Database,
  SunMoon,
  Bell,
} from "lucide-react";

const ITEMS = [
  {
    href: "/einstellungen/kontaktfelder",
    label: "Kontaktfelder",
    icon: TextCursorInput,
  },
  { href: "/einstellungen/tags", label: "Tags", icon: Tags },
  {
    href: "/einstellungen/benachrichtigungen",
    label: "Benachrichtigungen",
    icon: Bell,
  },
  { href: "/einstellungen/daten", label: "Daten", icon: Database },
  { href: "/einstellungen/darstellung", label: "Darstellung", icon: SunMoon },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="md:w-52 shrink-0">
      <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className={`h-9 px-3 inline-flex md:flex items-center gap-2 rounded-md text-sm whitespace-nowrap transition ${
                  active
                    ? "bg-surface border border-line text-ink font-medium"
                    : "text-sub hover:text-ink hover:bg-surface"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
