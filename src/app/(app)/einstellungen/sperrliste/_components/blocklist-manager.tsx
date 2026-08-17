"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import type { BlockedLead } from "@/lib/server/blocklist";
import {
  addBlockedLeadAction,
  removeBlockedLeadAction,
} from "../actions";

export function BlocklistManager({ initial }: { initial: BlockedLead[] }) {
  const [entries, setEntries] = useState(initial);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  function add() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addBlockedLeadAction({ email, name, note });
      setEntries(res.entries);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEmail("");
      setName("");
      setNote("");
    });
  }

  function remove(id: string) {
    setRemoving(id);
    startTransition(async () => {
      setEntries(await removeBlockedLeadAction({ id }));
      setRemoving(null);
    });
  }

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-1 inline-flex items-center gap-2">
          <Ban className="h-4 w-4 text-err" />
          Sperrliste
        </h2>
        <p className="text-xs text-sub mb-4">
          Wer hier steht, bekommt nie wieder eine Kampagnen-Mail — auch nicht,
          wenn die Firma später erneut gescrapt wird. Gesperrt wird über die
          E-Mail-Adresse und/oder den Namen; beides zusammen ist am sichersten,
          weil dieselbe Person sonst unter einer zweiten Adresse wieder
          auftaucht. Der Lead darf in der Tabelle stehen bleiben, er wird beim
          Versand still übersprungen.
        </p>

        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[11px] font-medium text-sub mb-1">
                E-Mail-Adresse
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="name@firma.de"
                className="w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-sub mb-1">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Vorname Nachname"
                className="w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-[11px] font-medium text-sub mb-1">
              Notiz (optional)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="z. B. hat um Löschung gebeten"
              className="w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>

          {error && <p className="text-xs text-err">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={add}
              disabled={pending}
              className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Sperren
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">
          Gesperrt{" "}
          <span className="text-sub font-normal">({entries.length})</span>
        </h2>
        {entries.length === 0 ? (
          <p className="text-xs text-sub">
            Noch niemand gesperrt. Trag jemanden ein, sobald er um Löschung
            bittet oder nicht mehr angeschrieben werden will.
          </p>
        ) : (
          <ul className="divide-y divide-line border border-line rounded-lg">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">
                    {e.name || e.email}
                  </div>
                  {e.name && e.email && (
                    <div className="text-[11px] text-sub truncate">
                      {e.email}
                    </div>
                  )}
                  {e.note && (
                    <div className="text-[11px] text-sub mt-0.5">{e.note}</div>
                  )}
                </div>
                <button
                  onClick={() => remove(e.id)}
                  disabled={pending}
                  title="Sperre aufheben"
                  aria-label="Sperre aufheben"
                  className="shrink-0 p-2 -m-1 text-sub hover:text-err disabled:opacity-40"
                >
                  {removing === e.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
