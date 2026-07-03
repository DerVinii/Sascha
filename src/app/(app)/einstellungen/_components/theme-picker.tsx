"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Monitor } from "lucide-react";
import { setThemeAction, type Theme } from "../actions";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function applyThemeToDocument(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemePicker({ current }: { current: Theme }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Theme>(current);
  const [pending, startTransition] = useTransition();

  function choose(theme: Theme) {
    setSelected(theme);
    // Sofort umschalten (ohne auf den Server zu warten) …
    applyThemeToDocument(theme);
    // … und per Cookie persistieren.
    startTransition(async () => {
      await setThemeAction(theme);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-3 gap-2 max-w-md">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = selected === o.value;
        return (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            disabled={pending && active}
            className={`rounded-lg border p-3 flex flex-col items-center gap-1.5 text-sm transition ${
              active
                ? "border-accent bg-accent-faint text-ink font-medium"
                : "border-line bg-bg/40 text-sub hover:text-ink hover:border-sub"
            }`}
          >
            <Icon className="h-5 w-5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
