"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { LeadTagWithCount } from "@/lib/scraping-types";
import { TagDot } from "./tag-badge";

type Props = {
  tags: LeadTagWithCount[];
  /** Aktuell gewählter Tag; null = keiner. */
  value: string | null;
  /** Erster Eintrag der Liste — „Ohne Tag" bzw. „Alle Kampagnen". */
  clearLabel: string;
  onSelect: (tagId: string | null) => void;
  onCreate: (name: string) => void;
  onDelete: (tag: LeadTagWithCount) => void;
  busy?: boolean;
};

/**
 * Auswahlliste für Kampagnen-Tags. Wird an zwei Stellen benutzt: im Menü einer
 * Kampagne (Tag setzen) und im Filter über dem Raster (Tag als Filter). Positioniert
 * wird sie vom Aufrufer — hier steckt nur der Inhalt.
 */
export function TagPicker({
  tags,
  value,
  clearLabel,
  onSelect,
  onCreate,
  onDelete,
  busy = false,
}: Props) {
  const [neu, setNeu] = useState("");

  function anlegen() {
    const name = neu.trim();
    if (!name) return;
    setNeu("");
    onCreate(name);
  }

  return (
    <div className="text-sm">
      <div className="max-h-64 overflow-y-auto py-1">
        <button
          onClick={() => onSelect(null)}
          disabled={busy}
          className="flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-sub hover:bg-bg disabled:opacity-50"
        >
          <span className="w-3.5 shrink-0">
            {value === null && <Check className="h-3.5 w-3.5 text-ink" />}
          </span>
          {clearLabel}
        </button>

        {tags.length > 0 && <div className="my-1 h-px bg-line" />}

        {tags.map((tag) => (
          <div key={tag.id} className="group/tag flex items-center hover:bg-bg">
            <button
              onClick={() => onSelect(tag.id)}
              disabled={busy}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-ink disabled:opacity-50"
            >
              <span className="w-3.5 shrink-0">
                {value === tag.id && <Check className="h-3.5 w-3.5" />}
              </span>
              <TagDot color={tag.color} />
              <span className="truncate">{tag.name}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-sub">
                {tag.count}
              </span>
            </button>
            {/* Ohne Löschen bliebe ein vertippter Tag für immer in der Liste.
                Am Zeiger erst beim Überfahren sichtbar, auf dem Handy immer. */}
            <button
              onClick={() => onDelete(tag)}
              disabled={busy}
              aria-label={`Tag „${tag.name}" löschen`}
              title="Tag überall löschen"
              className="mr-1 inline-flex h-8 w-8 md:h-6 md:w-6 shrink-0 items-center justify-center rounded text-sub hover:bg-surface hover:text-err disabled:opacity-50 md:opacity-0 md:group-hover/tag:opacity-100 md:focus:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                anlegen();
              }
            }}
            maxLength={40}
            placeholder="Neuer Tag …"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
          />
          <button
            onClick={anlegen}
            disabled={busy || !neu.trim()}
            aria-label="Tag anlegen"
            title="Tag anlegen"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-white hover:bg-sidebar-soft disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
