"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  createListAction,
  renameListAction,
  deleteListAction,
} from "../scraping/actions";
import type { LeadList } from "@/lib/scraping-types";

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function FolderGrid({ lists }: { lists: LeadList[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [menuId, setMenuId] = useState<string | null>(null);

  function create() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const { id } = await createListAction({ name: n });
      setName("");
      setCreating(false);
      router.push(`/vertrieb/scraping?list=${id}`);
    });
  }

  function rename(list: LeadList) {
    setMenuId(null);
    const n = window.prompt("Liste umbenennen:", list.name);
    if (!n || n.trim() === list.name) return;
    startTransition(async () => {
      await renameListAction({ id: list.id, name: n.trim() });
      router.refresh();
    });
  }

  function remove(list: LeadList) {
    setMenuId(null);
    if (
      !window.confirm(
        `Liste „${list.name}" inkl. ${list.count} Lead${list.count !== 1 ? "s" : ""} endgültig löschen?`,
      )
    )
      return;
    startTransition(async () => {
      await deleteListAction({ id: list.id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
          >
            <Plus className="h-4 w-4" />
            Liste erstellen
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") {
                  setCreating(false);
                  setName("");
                }
              }}
              placeholder="Name der Liste, z. B. Dachdecker München"
              className="h-9 w-72 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
            />
            <button
              onClick={create}
              disabled={pending || !name.trim()}
              className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Erstellen & öffnen
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setName("");
              }}
              className="h-9 px-3 text-sm text-sub hover:text-ink"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg">
            <FolderOpen className="h-6 w-6 text-info" />
          </div>
          <h3 className="text-sm font-semibold text-ink">Noch keine Listen</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-sub">
            Erstelle deine erste Liste — danach kannst du darin Leads scrapen, per
            CSV importieren oder manuell hinzufügen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lists.map((list) => (
            <div key={list.id} className="relative">
              <Link
                href={`/vertrieb/scraping?list=${list.id}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:border-sub hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-bg shrink-0">
                    <FolderOpen className="h-5 w-5 text-info" />
                  </div>
                  <div className="min-w-0 pr-6">
                    <div className="text-sm font-medium text-ink truncate">
                      {list.name}
                    </div>
                    <div className="text-xs text-sub mt-0.5">
                      {list.count} Lead{list.count !== 1 ? "s" : ""}
                      {list.createdAt ? ` · ${fmtDate(list.createdAt)}` : ""}
                    </div>
                  </div>
                </div>
              </Link>

              <button
                onClick={() => setMenuId(menuId === list.id ? null : list.id)}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-sub hover:bg-bg hover:text-ink"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuId === list.id && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuId(null)}
                  />
                  <div className="absolute right-2 top-10 z-50 w-40 rounded-lg border border-line bg-surface shadow-xl py-1 text-sm">
                    <button
                      onClick={() => rename(list)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-bg"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Umbenennen
                    </button>
                    <button
                      onClick={() => remove(list)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-err hover:bg-bg"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Löschen
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
