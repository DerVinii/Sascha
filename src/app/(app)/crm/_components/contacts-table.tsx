"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Columns3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings,
} from "lucide-react";
import { NewContactModal } from "./new-contact-modal";
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
  { key: "tags", label: "Tags" },
];

/** Custom-Field-Spalten bekommen ein Präfix, damit sie nie mit Standard-Keys kollidieren. */
const CF_PREFIX = "cf_";

const BLUE =
  "bg-accent hover:bg-accent-hover text-white";

export function ContactsTable({
  contacts,
  customColumns,
  tagColors,
}: {
  contacts: ContactRow[];
  customColumns: CustomColumn[];
  tagColors: Record<string, string | null>;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [colsOpen, setColsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [
        c.firstName,
        c.lastName,
        c.email,
        c.phone,
        c.companyName,
        c.tags.join(" "),
        // Custom-Werte typbewusst: Checkboxen nicht durchsuchen ("false"
        // wäre ein Falsch-Treffer), Datumsfelder auch im Anzeigeformat.
        ...customColumns.map((col) => {
          const v = c.custom[col.key];
          if (v == null || col.type === "checkbox") return "";
          if (col.type === "date")
            return `${String(v)} ${formatFieldDate(String(v))}`;
          return String(v);
        }),
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [contacts, query, customColumns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  // Neue Spalten (z. B. frisch angelegte Custom Fields) sind standardmäßig sichtbar.
  const cols = allColumns.filter((c) => visible[c.key] ?? true);

  function toggleAll() {
    if (rows.every((r) => selected.has(r.id))) {
      const next = new Set(selected);
      rows.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      rows.forEach((r) => next.add(r.id));
      setSelected(next);
    }
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

          <button className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition">
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

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
                        setVisible((v) => ({ ...v, [c.key]: e.target.checked }))
                      }
                    />
                    {c.label}
                  </label>
                ))}
                </div>
              </>
            )}
          </div>

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

        {/* Tabelle */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg/60 border-b border-line text-left text-[12px] text-sub">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={toggleAll}
                    className="h-5 w-5 md:h-4 md:w-4 accent-accent"
                    aria-label="Alle auswählen"
                  />
                </th>
                {cols.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">
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
                  <tr key={c.id} className="hover:bg-bg/50 transition">
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
                      <td key={col.key} className="px-4 py-3 whitespace-nowrap">
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
        <a href={`tel:${contact.phone}`} className="text-accent-ink hover:underline">
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
