"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  Tag,
  ChevronDown,
  X,
} from "lucide-react";
import {
  createListAction,
  renameListAction,
  deleteListAction,
  createLeadTagAction,
  setListTagAction,
  deleteLeadTagAction,
} from "../scraping/actions";
import type { LeadList, LeadTagWithCount } from "@/lib/scraping-types";
import { TagBadge, TagDot } from "./tag-badge";
import { TagPicker } from "./tag-picker";

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

export function FolderGrid({
  lists,
  tags,
}: {
  lists: LeadList[];
  tags: LeadTagWithCount[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [menuId, setMenuId] = useState<string | null>(null);
  /** Das Kachel-Menü zeigt entweder die Aktionen oder die Tag-Auswahl. */
  const [menuMode, setMenuMode] = useState<"aktionen" | "tag">("aktionen");
  /** Aktiver Tag-Filter (Tag-ID) — bewusst nur im Client: beim erneuten Öffnen
   *  der Seite sieht man wieder alle Kampagnen und sucht nicht nach fehlenden. */
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const filterTag = tags.find((t) => t.id === filterTagId) ?? null;
  const sichtbar = useMemo(
    () =>
      filterTagId ? lists.filter((l) => l.tag?.id === filterTagId) : lists,
    [lists, filterTagId],
  );

  function openMenu(listId: string) {
    setMenuId(menuId === listId ? null : listId);
    setMenuMode("aktionen");
  }

  function closeMenu() {
    setMenuId(null);
    setMenuMode("aktionen");
  }

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
    closeMenu();
    const n = window.prompt("Kampagne umbenennen:", list.name);
    if (!n || n.trim() === list.name) return;
    startTransition(async () => {
      await renameListAction({ id: list.id, name: n.trim() });
      router.refresh();
    });
  }

  function remove(list: LeadList) {
    closeMenu();
    if (
      !window.confirm(
        `Kampagne „${list.name}" inkl. ${list.count} Lead${list.count !== 1 ? "s" : ""} endgültig löschen?`,
      )
    )
      return;
    startTransition(async () => {
      await deleteListAction({ id: list.id });
      router.refresh();
    });
  }

  /** Tag einer Kampagne setzen oder entfernen (tagId = null). */
  function setTag(listId: string, tagId: string | null) {
    closeMenu();
    startTransition(async () => {
      await setListTagAction({ listId, tagId });
      router.refresh();
    });
  }

  /** Neuen Tag anlegen und der Kampagne direkt zuweisen. */
  function createAndAssign(listId: string, tagName: string) {
    closeMenu();
    startTransition(async () => {
      const tag = await createLeadTagAction({ name: tagName });
      await setListTagAction({ listId, tagId: tag.id });
      router.refresh();
    });
  }

  /** Neuen Tag aus dem Filter heraus anlegen — und gleich danach filtern. */
  function createAndFilter(tagName: string) {
    setFilterOpen(false);
    startTransition(async () => {
      const tag = await createLeadTagAction({ name: tagName });
      setFilterTagId(tag.id);
      router.refresh();
    });
  }

  /** Tag organisationsweit löschen; die Kampagnen bleiben, nur die Markierung fällt weg. */
  function deleteTag(tag: LeadTagWithCount) {
    const betroffen =
      tag.count > 0
        ? ` Die Markierung wird bei ${tag.count} Kampagne${tag.count !== 1 ? "n" : ""} entfernt — die Kampagnen selbst bleiben.`
        : "";
    if (!window.confirm(`Tag „${tag.name}" löschen?${betroffen}`)) return;
    closeMenu();
    setFilterOpen(false);
    if (filterTagId === tag.id) setFilterTagId(null);
    startTransition(async () => {
      await deleteLeadTagAction({ id: tag.id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
          >
            <Plus className="h-4 w-4" />
            Kampagne erstellen
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
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
              placeholder="Name der Kampagne, z. B. Dachdecker München"
              className="h-9 w-full sm:w-72 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
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

        {/* Tag-Filter */}
        <div className="relative">
          <div
            className={`flex items-center rounded-md border ${filterTag ? "border-sub" : "border-line"} bg-surface`}
          >
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="h-9 pl-3 pr-2 inline-flex items-center gap-2 text-sm text-ink"
            >
              {filterTag ? (
                <>
                  <TagDot color={filterTag.color} />
                  <span className="max-w-[10rem] truncate">{filterTag.name}</span>
                </>
              ) : (
                <>
                  <Tag className="h-4 w-4 text-sub" />
                  Nach Tag filtern
                </>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-sub" />
            </button>
            {filterTag && (
              <button
                onClick={() => setFilterTagId(null)}
                aria-label="Filter aufheben"
                title="Filter aufheben"
                className="h-9 w-8 inline-flex items-center justify-center border-l border-line text-sub hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {filterOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFilterOpen(false)}
              />
              <div className="absolute left-0 top-11 z-50 w-64 rounded-lg border border-line bg-surface shadow-xl">
                <TagPicker
                  tags={tags}
                  value={filterTagId}
                  clearLabel="Alle Kampagnen"
                  busy={pending}
                  onSelect={(tagId) => {
                    setFilterTagId(tagId);
                    setFilterOpen(false);
                  }}
                  onCreate={createAndFilter}
                  onDelete={deleteTag}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg">
            <FolderOpen className="h-6 w-6 text-info" />
          </div>
          <h3 className="text-sm font-semibold text-ink">Noch keine Kampagnen</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-sub">
            Erstelle deine erste Kampagne — danach kannst du darin Leads scrapen,
            per CSV importieren oder manuell hinzufügen.
          </p>
        </div>
      ) : sichtbar.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-bg">
            <Tag className="h-6 w-6 text-info" />
          </div>
          <h3 className="text-sm font-semibold text-ink">
            Keine Kampagne mit dem Tag „{filterTag?.name}"
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-sub">
            Vergib den Tag über das Menü einer Kampagne — oder hebe den Filter auf.
          </p>
          <button
            onClick={() => setFilterTagId(null)}
            className="mt-3 h-8 px-3 inline-flex items-center gap-2 rounded-md border border-line bg-surface text-xs text-ink hover:border-sub"
          >
            <X className="h-3.5 w-3.5" />
            Filter aufheben
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sichtbar.map((list) => (
            <div key={list.id} className="relative">
              <Link
                href={`/vertrieb/scraping?list=${list.id}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:border-sub hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-bg shrink-0">
                    <FolderOpen className="h-5 w-5 text-info" />
                  </div>
                  <div className="min-w-0 pr-10 md:pr-6">
                    <div className="text-sm font-medium text-ink truncate">
                      {list.name}
                    </div>
                    <div className="text-xs text-sub mt-0.5">
                      {list.count} Lead{list.count !== 1 ? "s" : ""}
                      {list.createdAt ? ` · ${fmtDate(list.createdAt)}` : ""}
                    </div>
                    {list.tag && <TagBadge tag={list.tag} className="mt-2" />}
                  </div>
                </div>
              </Link>

              {/* Auf dem Handy größer (Fingerfläche), ab md wieder 28 px. */}
              <button
                onClick={() => openMenu(list.id)}
                aria-label="Kampagnen-Menü"
                className="absolute right-2 top-2 inline-flex h-10 w-10 md:h-7 md:w-7 items-center justify-center rounded-md text-sub hover:bg-bg hover:text-ink"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuId === list.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={closeMenu} />
                  <div
                    className={`absolute right-2 top-12 md:top-10 z-50 rounded-lg border border-line bg-surface shadow-xl ${menuMode === "tag" ? "w-64" : "w-40 py-1"} text-sm`}
                  >
                    {menuMode === "aktionen" ? (
                      <>
                        <button
                          onClick={() => rename(list)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-ink hover:bg-bg"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Umbenennen
                        </button>
                        <button
                          onClick={() => setMenuMode("tag")}
                          className="flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-ink hover:bg-bg"
                        >
                          <Tag className="h-3.5 w-3.5" />
                          Tag
                          {list.tag && <TagDot color={list.tag.color} />}
                        </button>
                        <button
                          onClick={() => remove(list)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 md:py-1.5 text-left text-err hover:bg-bg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Löschen
                        </button>
                      </>
                    ) : (
                      <TagPicker
                        tags={tags}
                        value={list.tag?.id ?? null}
                        clearLabel="Ohne Tag"
                        busy={pending}
                        onSelect={(tagId) => setTag(list.id, tagId)}
                        onCreate={(tagName) => createAndAssign(list.id, tagName)}
                        onDelete={deleteTag}
                      />
                    )}
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
