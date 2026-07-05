"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Columns3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings,
  Plus,
  X,
  Trash2,
  Tag as TagIcon,
  ArrowRightLeft,
  Check,
} from "lucide-react";
import { NewContactModal } from "./new-contact-modal";
import {
  StatusPill,
  STATUS_LABELS,
} from "@/components/crm/status-pill";
import type { ContactStatus } from "../actions";
import {
  bulkDeleteContactsAction,
  bulkUpdateContactStatusAction,
  bulkAddContactTagsAction,
  bulkRemoveContactTagsAction,
} from "../actions";
import {
  formatFieldDate,
  type ContactFieldType,
  type ContactFieldValue,
} from "@/lib/contact-fields";

export type ContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: ContactStatus;
  companyName: string | null;
  domain: string | null;
  tags: string[];
  /** Werte der individuellen Felder (custom_fields.fields). */
  custom: Record<string, ContactFieldValue>;
};

export type CustomColumn = {
  key: string;
  label: string;
  type: ContactFieldType;
};

const STANDARD_COLUMNS = [
  { key: "firstName", label: "Vorname" },
  { key: "lastName", label: "Nachname" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "companyName", label: "Firmenname" },
  { key: "domain", label: "Webseite" },
  { key: "status", label: "Status" },
  { key: "tags", label: "Tags" },
];

/** Custom-Field-Spalten bekommen ein Präfix, damit sie nie mit Standard-Keys kollidieren. */
const CF_PREFIX = "cf_";

const BLUE = "bg-accent hover:bg-accent-hover text-white";

// ---------------------------------------------------------------------------
// Filter-Modell
// ---------------------------------------------------------------------------

type FilterKind = "text" | "status" | "tags" | "checkbox";

type FilterOp =
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "is"
  | "is_not"
  | "has"
  | "not_has"
  | "is_checked"
  | "is_unchecked";

type FilterCond = { id: number; field: string; op: FilterOp; value: string };

const OP_LABELS: Record<FilterOp, string> = {
  contains: "enthält",
  not_contains: "enthält nicht",
  is_empty: "ist leer",
  is_not_empty: "ist nicht leer",
  is: "ist",
  is_not: "ist nicht",
  has: "enthält",
  not_has: "enthält nicht",
  is_checked: "ist angehakt",
  is_unchecked: "ist nicht angehakt",
};

const OPS_BY_KIND: Record<FilterKind, FilterOp[]> = {
  text: ["contains", "not_contains", "is_empty", "is_not_empty"],
  status: ["is", "is_not"],
  tags: ["has", "not_has", "is_empty", "is_not_empty"],
  checkbox: ["is_checked", "is_unchecked"],
};

function opNeedsValue(op: FilterOp): boolean {
  return (
    op === "contains" ||
    op === "not_contains" ||
    op === "is" ||
    op === "is_not" ||
    op === "has" ||
    op === "not_has"
  );
}

function fieldKind(
  field: string,
  customTypes: Record<string, ContactFieldType>,
): FilterKind {
  if (field === "tags") return "tags";
  if (field === "status") return "status";
  if (field.startsWith(CF_PREFIX)) {
    return customTypes[field.slice(CF_PREFIX.length)] === "checkbox"
      ? "checkbox"
      : "text";
  }
  return "text";
}

function fieldRawValue(
  c: ContactRow,
  field: string,
  customTypes: Record<string, ContactFieldType>,
): string {
  if (field.startsWith(CF_PREFIX)) {
    const key = field.slice(CF_PREFIX.length);
    const v = c.custom[key];
    if (v == null) return "";
    const t = customTypes[key];
    if (t === "date") return `${String(v)} ${formatFieldDate(String(v))}`;
    if (t === "checkbox") return v === true ? "true" : "";
    return String(v);
  }
  switch (field) {
    case "firstName":
      return c.firstName ?? "";
    case "lastName":
      return c.lastName ?? "";
    case "phone":
      return c.phone ?? "";
    case "email":
      return c.email ?? "";
    case "companyName":
      return c.companyName ?? "";
    case "domain":
      return c.domain ?? "";
    case "status":
      return c.status;
    case "tags":
      return c.tags.join(" ");
    default:
      return "";
  }
}

function condComplete(cond: FilterCond): boolean {
  return !opNeedsValue(cond.op) || cond.value.trim() !== "";
}

function matchCond(
  c: ContactRow,
  cond: FilterCond,
  customTypes: Record<string, ContactFieldType>,
): boolean {
  const kind = fieldKind(cond.field, customTypes);

  if (kind === "tags") {
    switch (cond.op) {
      case "has":
        return c.tags.includes(cond.value);
      case "not_has":
        return !c.tags.includes(cond.value);
      case "is_empty":
        return c.tags.length === 0;
      case "is_not_empty":
        return c.tags.length > 0;
      default:
        return true;
    }
  }

  if (kind === "status") {
    if (cond.op === "is") return c.status === cond.value;
    if (cond.op === "is_not") return c.status !== cond.value;
    return true;
  }

  if (kind === "checkbox") {
    const v = c.custom[cond.field.slice(CF_PREFIX.length)] === true;
    if (cond.op === "is_checked") return v;
    if (cond.op === "is_unchecked") return !v;
    return true;
  }

  // text
  const raw = fieldRawValue(c, cond.field, customTypes);
  const text = raw.toLowerCase();
  const val = cond.value.trim().toLowerCase();
  switch (cond.op) {
    case "contains":
      return text.includes(val);
    case "not_contains":
      return !text.includes(val);
    case "is_empty":
      return raw.trim() === "";
    case "is_not_empty":
      return raw.trim() !== "";
    default:
      return true;
  }
}

export function ContactsTable({
  contacts,
  customColumns,
  tagColors,
}: {
  contacts: ContactRow[];
  customColumns: CustomColumn[];
  tagColors: Record<string, string | null>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colsOpen, setColsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterCond[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk-Menüs
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const [tagPick, setTagPick] = useState<Set<string>>(new Set());

  const condId = useRef(1);

  const allColumns = useMemo(
    () => [
      ...STANDARD_COLUMNS,
      ...customColumns.map((c) => ({
        key: `${CF_PREFIX}${c.key}`,
        label: c.label,
      })),
    ],
    [customColumns],
  );

  const customTypes = useMemo(
    () =>
      Object.fromEntries(customColumns.map((c) => [c.key, c.type])) as Record<
        string,
        ContactFieldType
      >,
    [customColumns],
  );

  const availableTags = useMemo(() => Object.keys(tagColors).sort(), [tagColors]);

  const activeFilters = useMemo(
    () => filters.filter(condComplete),
    [filters],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      // 1) Filterbedingungen (UND-verknüpft)
      for (const f of activeFilters) {
        if (!matchCond(c, f, customTypes)) return false;
      }
      // 2) Freitextsuche
      if (!q) return true;
      return [
        c.firstName,
        c.lastName,
        c.email,
        c.phone,
        c.companyName,
        c.tags.join(" "),
        ...customColumns.map((col) => {
          const v = c.custom[col.key];
          if (v == null || col.type === "checkbox") return "";
          if (col.type === "date")
            return `${String(v)} ${formatFieldDate(String(v))}`;
          return String(v);
        }),
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [contacts, query, activeFilters, customTypes, customColumns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  // Neue Spalten (z. B. frisch angelegte Custom Fields) sind standardmäßig sichtbar.
  const cols = allColumns.filter((c) => visible[c.key] ?? true);

  const selectedCount = selected.size;

  function toggleAll() {
    if (rows.length > 0 && rows.every((r) => selected.has(r.id))) {
      const next = new Set(selected);
      rows.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      rows.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
    setMoveOpen(false);
    setTagsOpen(false);
  }

  // ----- Filter-Helfer -----
  function addFilter() {
    setFilters((f) => [
      ...f,
      { id: condId.current++, field: "firstName", op: "contains", value: "" },
    ]);
  }
  function updateFilter(id: number, patch: Partial<FilterCond>) {
    setFilters((f) =>
      f.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
    setPage(1);
  }
  function removeFilter(id: number) {
    setFilters((f) => f.filter((c) => c.id !== id));
    setPage(1);
  }
  function resetFilters() {
    setFilters([]);
    setPage(1);
  }

  // ----- Bulk-Helfer -----
  function runBulk(fn: () => Promise<unknown>, close?: () => void) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setSelected(new Set());
        close?.();
        router.refresh();
      }
    });
  }

  function bulkMove(status: ContactStatus) {
    const ids = [...selected];
    runBulk(() => bulkUpdateContactStatusAction(ids, status), () =>
      setMoveOpen(false),
    );
  }

  function bulkDelete() {
    const n = selected.size;
    if (
      !window.confirm(
        `${n} Kontakt${n === 1 ? "" : "e"} unwiderruflich löschen?`,
      )
    )
      return;
    const ids = [...selected];
    runBulk(() => bulkDeleteContactsAction(ids));
  }

  function applyTags() {
    const names = [...tagPick];
    if (names.length === 0) return;
    const ids = [...selected];
    runBulk(
      () =>
        tagMode === "add"
          ? bulkAddContactTagsAction(ids, names)
          : bulkRemoveContactTagsAction(ids, names),
      () => {
        setTagsOpen(false);
        setTagPick(new Set());
      },
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Kopf */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Kontakte{" "}
            <span className="text-sm font-normal text-sub">
              {contacts.length} Datensätze
            </span>
          </h2>
        </div>
        <Link
          href="/einstellungen/kontaktfelder"
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Einstellungen</span>
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        {/* Toolbar */}
        <div className="relative flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sub" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Suche"
              className="w-full h-9 pl-8 pr-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          {/* Filter */}
          <div>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md border text-sm font-medium transition ${
                activeFilters.length > 0
                  ? "border-accent/40 bg-accent/10 text-accent-ink"
                  : "border-line bg-surface text-sub hover:bg-bg"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
              {activeFilters.length > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
                  {activeFilters.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {filterOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setFilterOpen(false)}
                />
                <div className="absolute left-2 right-2 sm:left-auto sm:right-auto top-full mt-1 z-20 w-auto sm:w-[34rem] max-w-[calc(100vw-1rem)] bg-surface border border-line rounded-lg shadow-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink">
                      Filter
                    </span>
                    {filters.length > 0 && (
                      <button
                        onClick={resetFilters}
                        className="text-xs text-sub hover:text-ink"
                      >
                        Zurücksetzen
                      </button>
                    )}
                  </div>

                  {filters.length === 0 ? (
                    <p className="text-xs text-sub py-2">
                      Noch keine Filter. Füge eine Bedingung hinzu, um die
                      Liste einzugrenzen.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filters.map((cond) => (
                        <ConditionRow
                          key={cond.id}
                          cond={cond}
                          allColumns={allColumns}
                          customTypes={customTypes}
                          availableTags={availableTags}
                          onChange={(patch) => updateFilter(cond.id, patch)}
                          onRemove={() => removeFilter(cond.id)}
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={addFilter}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
                    >
                      <Plus className="h-4 w-4" />
                      Filter hinzufügen
                    </button>
                    <button
                      onClick={() => setFilterOpen(false)}
                      className={`h-8 px-3 inline-flex items-center rounded-md text-sm font-medium transition ${BLUE}`}
                    >
                      Fertig
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Spalten */}
          <div>
            <button
              onClick={() => setColsOpen((v) => !v)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition"
            >
              <Columns3 className="h-4 w-4" />
              Spalten
            </button>
            {colsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setColsOpen(false)}
                />
                <div className="absolute right-2 top-full mt-1 z-20 w-48 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-md shadow-lg p-1.5">
                  {allColumns.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visible[c.key] ?? true}
                        onChange={(e) =>
                          setVisible((v) => ({
                            ...v,
                            [c.key]: e.target.checked,
                          }))
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Mehr Optionen */}
          <div>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition"
            >
              Mehr Optionen
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute right-2 top-full mt-1 z-20 w-48 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-md shadow-lg p-1.5">
                  <a
                    href="/api/crm/export"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg"
                  >
                    <Download className="h-4 w-4" />
                    Als CSV exportieren
                  </a>
                </div>
              </>
            )}
          </div>

          <NewContactModal
            trigger={(open) => (
              <button
                onClick={open}
                className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition ${BLUE}`}
              >
                + Kontakt hinzufügen
              </button>
            )}
          />
        </div>

        {/* Bulk-Aktionsleiste */}
        {selectedCount > 0 && (
          <div className="relative flex flex-wrap items-center gap-2 p-3 border-b border-line bg-accent/5">
            <span className="text-sm font-medium text-ink">
              {selectedCount} ausgewählt
            </span>
            {selectedCount < filtered.length && (
              <button
                onClick={selectAllFiltered}
                className="text-xs text-accent-ink hover:underline"
              >
                Alle {filtered.length} auswählen
              </button>
            )}

            <div className="h-5 w-px bg-line mx-1 hidden sm:block" />

            {/* Verschieben nach Status */}
            <div>
              <button
                onClick={() => {
                  setMoveOpen((v) => !v);
                  setTagsOpen(false);
                }}
                disabled={pending}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Verschieben
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {moveOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMoveOpen(false)}
                  />
                  <div className="absolute left-2 top-full mt-1 z-20 w-52 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-md shadow-lg p-1.5">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-sub">
                      Status setzen auf
                    </div>
                    {(Object.keys(STATUS_LABELS) as ContactStatus[]).map(
                      (key) => (
                        <button
                          key={key}
                          onClick={() => bulkMove(key)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg text-left"
                        >
                          <StatusPill status={key} />
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Tags */}
            <div>
              <button
                onClick={() => {
                  setTagsOpen((v) => !v);
                  setMoveOpen(false);
                }}
                disabled={pending || availableTags.length === 0}
                title={
                  availableTags.length === 0
                    ? "Noch keine Tags angelegt"
                    : undefined
                }
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
              >
                <TagIcon className="h-4 w-4" />
                Tags
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {tagsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setTagsOpen(false)}
                  />
                  <div className="absolute left-2 top-full mt-1 z-20 w-56 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-md shadow-lg p-2">
                    <div className="flex rounded-md border border-line overflow-hidden mb-2 text-sm">
                      <button
                        onClick={() => setTagMode("add")}
                        className={`flex-1 h-8 ${
                          tagMode === "add"
                            ? "bg-accent text-white"
                            : "bg-surface text-sub hover:bg-bg"
                        }`}
                      >
                        Hinzufügen
                      </button>
                      <button
                        onClick={() => setTagMode("remove")}
                        className={`flex-1 h-8 border-l border-line ${
                          tagMode === "remove"
                            ? "bg-accent text-white"
                            : "bg-surface text-sub hover:bg-bg"
                        }`}
                      >
                        Entfernen
                      </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {availableTags.map((t) => (
                        <label
                          key={t}
                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={tagPick.has(t)}
                            onChange={(e) => {
                              const next = new Set(tagPick);
                              if (e.target.checked) next.add(t);
                              else next.delete(t);
                              setTagPick(next);
                            }}
                          />
                          <span
                            className="pill"
                            style={{
                              background: tagColors[t] ?? "#e2e8f0",
                              color: "#0f172a",
                            }}
                          >
                            {t}
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={applyTags}
                      disabled={pending || tagPick.size === 0}
                      className={`mt-2 w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition ${BLUE} disabled:opacity-50`}
                    >
                      <Check className="h-4 w-4" />
                      {tagMode === "add" ? "Hinzufügen" : "Entfernen"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Löschen */}
            <button
              onClick={bulkDelete}
              disabled={pending}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-err/40 bg-err/10 text-err text-sm font-medium hover:bg-err/20 transition disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Löschen
            </button>

            <div className="flex-1" />

            <button
              onClick={clearSelection}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sub text-sm font-medium hover:bg-bg transition"
            >
              <X className="h-4 w-4" />
              Auswahl aufheben
            </button>
          </div>
        )}

        {/* Tabelle */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg/60 border-b border-line text-left text-[12px] text-sub">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      rows.length > 0 && rows.every((r) => selected.has(r.id))
                    }
                    onChange={toggleAll}
                    className="h-5 w-5 md:h-4 md:w-4 accent-accent"
                    aria-label="Alle auswählen"
                  />
                </th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className="px-4 py-3 font-medium whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    className="px-4 py-12 text-center text-sub"
                  >
                    Keine Kontakte gefunden.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-bg/50 transition ${
                      selected.has(c.id) ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          setSelected(next);
                        }}
                        className="h-5 w-5 md:h-4 md:w-4 accent-accent"
                        aria-label="Auswählen"
                      />
                    </td>
                    {cols.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 whitespace-nowrap"
                      >
                        <CellValue
                          contact={c}
                          col={col.key}
                          customTypes={customTypes}
                          tagColors={tagColors}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-line text-sm text-sub">
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md border border-line hover:bg-bg disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">{safePage}</span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md border border-line hover:bg-bg disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span>
              Zeige {filtered.length === 0 ? 0 : start + 1}–
              {Math.min(start + perPage, filtered.length)} von {filtered.length}{" "}
              Kontakte
            </span>
            <label className="flex items-center gap-1.5">
              Zeilen pro Seite:
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 px-1.5 border border-line rounded-md bg-surface text-ink"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eine Filterbedingung (Feld · Operator · Wert)
// ---------------------------------------------------------------------------

function ConditionRow({
  cond,
  allColumns,
  customTypes,
  availableTags,
  onChange,
  onRemove,
}: {
  cond: FilterCond;
  allColumns: { key: string; label: string }[];
  customTypes: Record<string, ContactFieldType>;
  availableTags: string[];
  onChange: (patch: Partial<FilterCond>) => void;
  onRemove: () => void;
}) {
  const kind = fieldKind(cond.field, customTypes);
  const ops = OPS_BY_KIND[kind];

  const selectCls =
    "h-8 px-2 border border-line rounded-md bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Feld */}
      <select
        value={cond.field}
        onChange={(e) => {
          const nextField = e.target.value;
          const nextKind = fieldKind(nextField, customTypes);
          // Operator zurücksetzen, wenn er zur neuen Feldart nicht passt.
          const nextOp = OPS_BY_KIND[nextKind].includes(cond.op)
            ? cond.op
            : OPS_BY_KIND[nextKind][0];
          onChange({ field: nextField, op: nextOp, value: "" });
        }}
        className={`${selectCls} flex-1 min-w-[8rem]`}
      >
        {allColumns.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={cond.op}
        onChange={(e) =>
          onChange({ op: e.target.value as FilterOp, value: "" })
        }
        className={selectCls}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      {/* Wert */}
      {opNeedsValue(cond.op) &&
        (kind === "status" ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className={`${selectCls} flex-1 min-w-[8rem]`}
          >
            <option value="">– wählen –</option>
            {(Object.keys(STATUS_LABELS) as ContactStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k]}
              </option>
            ))}
          </select>
        ) : kind === "tags" ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className={`${selectCls} flex-1 min-w-[8rem]`}
          >
            <option value="">– wählen –</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={cond.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Wert"
            className="h-8 px-2 border border-line rounded-md bg-bg text-sm text-ink flex-1 min-w-[8rem] focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        ))}

      <button
        onClick={onRemove}
        aria-label="Bedingung entfernen"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sub hover:bg-bg hover:text-err transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function CellValue({
  contact,
  col,
  customTypes,
  tagColors,
}: {
  contact: ContactRow;
  col: string;
  customTypes: Record<string, ContactFieldType>;
  tagColors: Record<string, string | null>;
}) {
  if (col.startsWith(CF_PREFIX)) {
    return (
      <CustomCellValue
        value={contact.custom[col.slice(CF_PREFIX.length)] ?? null}
        type={customTypes[col.slice(CF_PREFIX.length)]}
      />
    );
  }

  switch (col) {
    case "firstName":
      return (
        <Link
          href={`/crm/${contact.id}`}
          className="font-medium text-ink hover:underline"
        >
          {contact.firstName || "—"}
        </Link>
      );
    case "lastName":
      return <span className="text-ink">{contact.lastName || "—"}</span>;
    case "phone":
      return contact.phone ? (
        <a
          href={`tel:${contact.phone}`}
          className="text-accent-ink hover:underline"
        >
          {contact.phone}
        </a>
      ) : (
        <span className="text-sub">—</span>
      );
    case "email":
      return contact.email ? (
        <a href={`mailto:${contact.email}`} className="text-ink hover:underline">
          {contact.email}
        </a>
      ) : (
        <span className="text-sub">—</span>
      );
    case "companyName":
      return <span className="text-ink">{contact.companyName || "—"}</span>;
    case "status":
      return <StatusPill status={contact.status} />;
    case "domain":
      return contact.domain ? (
        <a
          href={
            contact.domain.startsWith("http")
              ? contact.domain
              : `https://${contact.domain}`
          }
          target="_blank"
          rel="noreferrer"
          className="text-sub hover:text-ink hover:underline"
        >
          {contact.domain}
        </a>
      ) : (
        <span className="text-sub">—</span>
      );
    case "tags":
      return contact.tags.length > 0 ? (
        <span className="inline-flex flex-wrap gap-1 max-w-[260px]">
          {contact.tags.map((t) => (
            <span
              key={t}
              className="pill"
              style={{
                background: tagColors[t] ?? "#e2e8f0",
                color: "#0f172a",
              }}
            >
              {t}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sub">—</span>
      );
    default:
      return <span className="text-sub">—</span>;
  }
}

function CustomCellValue({
  value,
  type,
}: {
  value: ContactFieldValue;
  type: ContactFieldType | undefined;
}) {
  if (type === "checkbox") {
    return value === true ? (
      <span className="text-ok font-medium">✓</span>
    ) : (
      <span className="text-sub">—</span>
    );
  }
  if (value == null || value === "") {
    return <span className="text-sub">—</span>;
  }
  switch (type) {
    case "url": {
      const href = String(value);
      return (
        <a
          href={href.startsWith("http") ? href : `https://${href}`}
          target="_blank"
          rel="noreferrer"
          className="text-sub hover:text-ink hover:underline"
        >
          {href}
        </a>
      );
    }
    case "phone":
      return (
        <a
          href={`tel:${String(value)}`}
          className="text-accent-ink hover:underline"
        >
          {String(value)}
        </a>
      );
    case "date":
      return <span className="text-ink">{formatFieldDate(String(value))}</span>;
    case "number":
      return <span className="text-ink tabular-nums">{String(value)}</span>;
    default:
      return <span className="text-ink">{String(value)}</span>;
  }
}
