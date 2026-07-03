"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "../actions";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => logoutAction())}
      disabled={pending}
      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      {pending ? "Wird abgemeldet …" : "Auf diesem Gerät abmelden"}
    </button>
  );
}
