"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrgNameAction } from "../actions";

export function OrgNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateOrgNameAction(trimmed);
        setSaved(true);
        router.refresh();
      } catch {
        setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-md">
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        maxLength={80}
        className="flex-1 h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
        aria-label="Name der Organisation"
      />
      <button
        type="submit"
        disabled={pending || !name.trim() || name.trim() === initialName}
        className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
      >
        {pending ? "Speichert …" : "Speichern"}
      </button>
      {saved && !pending && (
        <span className="text-xs text-ok">Gespeichert.</span>
      )}
      {error && <span className="text-xs text-err">{error}</span>}
    </form>
  );
}
