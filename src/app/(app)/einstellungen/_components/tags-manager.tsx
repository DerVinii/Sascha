"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { STAGE_COLORS } from "@/lib/pipeline-templates";
import {
  createTagAction,
  renameTagAction,
  updateTagColorAction,
  deleteTagAction,
  adoptUnmanagedTagAction,
} from "../actions";

type TagRow = { id: string; name: string; color: string | null; count: number };

const DEFAULT_COLOR = STAGE_COLORS[3]; // Hellblau

export function TagsManager({
  tags,
  unmanaged,
}: {
  tags: TagRow[];
  unmanaged: { name: string; count: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TagRow | null>(null);

  // Formular "Tag anlegen"
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      }
    });
  }

  function nameExists(candidate: string, exceptId?: string): boolean {
    const lower = candidate.toLowerCase();
    return tags.some(
      (t) => t.id !== exceptId && t.name.toLowerCase() === lower,
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (nameExists(trimmed)) {
      setError(`Tag "${trimmed}" existiert bereits.`);
      return;
    }
    run(async () => {
      await createTagAction(trimmed, color);
      setName("");
      setColor(DEFAULT_COLOR);
    });
  }

  return (
    <div className="space-y-5">
      {tags.length === 0 ? (
        <p className="text-sm text-sub py-2">Noch keine Tags angelegt.</p>
      ) : (
        <ul className="space-y-1.5">
          {tags.map((t) => (
            <li
              key={`${t.id}:${t.name}:${t.color}`}
              className="flex items-center gap-1.5 rounded-md border border-line bg-bg/40 px-2 py-1.5"
            >
              <ColorSwatch
                color={t.color}
                disabled={pending}
                onSelect={(c) => run(() => updateTagColorAction(t.id, c))}
              />
              <input
                defaultValue={t.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v || v === t.name) return;
                  if (nameExists(v, t.id)) {
                    setError(`Tag "${v}" existiert bereits.`);
                    return;
                  }
                  run(() => renameTagAction(t.id, v));
                }}
                disabled={pending}
                className="flex-1 min-w-0 h-8 px-2 border border-line rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                aria-label="Tag-Name"
              />
              <span className="text-[11px] text-sub tabular-nums shrink-0 whitespace-nowrap text-right">
                {t.count}<span className="hidden sm:inline"> Kontakt{t.count === 1 ? "" : "e"}</span>
              </span>
              <button
                onClick={() => setConfirmDelete(t)}
                disabled={pending}
                className="h-9 w-9 md:h-7 md:w-7 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition disabled:opacity-40"
                aria-label={`Tag ${t.name} löschen`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Tag anlegen */}
      <form
        onSubmit={handleCreate}
        className="pt-4 border-t border-line space-y-3"
      >
        <div className="text-[11px] font-medium text-sub uppercase tracking-wide">
          Neuer Tag
        </div>
        <div className="flex items-center gap-2">
          <ColorSwatch color={color} disabled={pending} onSelect={setColor} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag-Name, z. B. Warm"
            maxLength={40}
            className="flex-1 min-w-0 h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Wird angelegt …" : "Anlegen"}
          </button>
        </div>
        {error && <p className="text-xs text-err">{error}</p>}
      </form>

      {/* Auf Kontakten gefundene, unverwaltete Tags */}
      {unmanaged.length > 0 && (
        <div className="pt-4 border-t border-line">
          <div className="text-[11px] font-medium text-sub uppercase tracking-wide mb-2">
            Auf Kontakten gefunden (nicht verwaltet)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unmanaged.map((u) => (
              <button
                key={u.name}
                onClick={() =>
                  run(() => adoptUnmanagedTagAction(u.name, DEFAULT_COLOR))
                }
                disabled={pending}
                title="Klicken, um diesen Tag zu übernehmen"
                className="pill bg-bg text-sub border border-line hover:text-ink hover:border-sub transition disabled:opacity-50"
              >
                {u.name} · {u.count}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-sub mt-2">
            Diese Tags stehen auf Kontakten (z. B. aus Importen), sind aber
            noch nicht verwaltet. Klicken übernimmt sie mit Standardfarbe;
            existiert der Tag bereits in anderer Schreibweise, werden die
            Kontakte auf die verwaltete Schreibweise migriert.
          </p>
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending)
              setConfirmDelete(null);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-xl p-5">
            <h3 className="text-sm font-semibold text-ink">Tag löschen?</h3>
            <p className="text-sm text-sub mt-2">
              Der Tag{" "}
              <span className="font-medium text-ink">{confirmDelete.name}</span>{" "}
              wird gelöscht und von{" "}
              <span className="font-medium text-ink">
                {confirmDelete.count}
              </span>{" "}
              Kontakt{confirmDelete.count === 1 ? "" : "en"} entfernt. Das kann
              nicht rückgängig gemacht werden.
            </p>
            {error && <p className="text-xs text-err mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
                className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  const id = confirmDelete.id;
                  run(async () => {
                    await deleteTagAction(id);
                    setConfirmDelete(null);
                  });
                }}
                disabled={pending}
                className="h-9 px-4 bg-err text-white text-sm font-medium rounded-md hover:opacity-90 transition disabled:opacity-50"
              >
                {pending ? "Wird gelöscht …" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorSwatch({
  color,
  disabled,
  onSelect,
}: {
  color: string | null;
  disabled: boolean;
  onSelect: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="h-8 w-8 md:h-6 md:w-6 rounded-full border border-line"
        style={{ background: color ?? "#e2e8f0" }}
        aria-label="Farbe wählen"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={() => setOpen(false)} />
          <div className="absolute z-10 top-7 left-0 bg-surface border border-line rounded-md p-2 shadow-lg grid grid-cols-8 gap-1.5 w-[236px]">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className="h-6 w-6 rounded-full border border-line"
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
