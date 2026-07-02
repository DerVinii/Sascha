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

export type ContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  domain: string | null;
};

const ALL_COLUMNS = [
  { key: "firstName", label: "Vorname" },
  { key: "lastName", label: "Nachname" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "companyName", label: "Firmenname" },
  { key: "domain", label: "Webseite" },
] as const;

type ColKey = (typeof ALL_COLUMNS)[number]["key"];

const BLUE =
  "bg-[#2563eb] hover:bg-[#1d4ed8] text-white";

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    companyName: true,
    domain: true,
  });
  const [colsOpen, setColsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.companyName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [contacts, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const rows = filtered.slice(start, start + perPage);
  const cols = ALL_COLUMNS.filter((c) => visible[c.key]);

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
          href="/einstellungen"
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Einstellungen</span>
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sub" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Suche"
              className="w-full h-9 pl-8 pr-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
            />
          </div>

          <button className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition">
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setColsOpen((v) => !v)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition"
            >
              <Columns3 className="h-4 w-4" />
              Spalten
            </button>
            {colsOpen && (
              <div
                className="absolute right-0 top-10 z-20 w-48 bg-surface border border-line rounded-md shadow-lg p-1.5"
                onMouseLeave={() => setColsOpen(false)}
              >
                {ALL_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible[c.key]}
                      onChange={(e) =>
                        setVisible((v) => ({ ...v, [c.key]: e.target.checked }))
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-sub text-sm font-medium hover:bg-bg transition"
            >
              Mehr Optionen
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {moreOpen && (
              <div
                className="absolute right-0 top-10 z-20 w-48 bg-surface border border-line rounded-md shadow-lg p-1.5"
                onMouseLeave={() => setMoreOpen(false)}
              >
                <a
                  href="/api/crm/export"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-bg"
                >
                  <Download className="h-4 w-4" />
                  Als CSV exportieren
                </a>
              </div>
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
                        aria-label="Auswählen"
                      />
                    </td>
                    {cols.map((col) => (
                      <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                        <CellValue contact={c} col={col.key} />
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
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-line hover:bg-bg disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular-nums">{safePage}</span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-line hover:bg-bg disabled:opacity-40"
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

function CellValue({ contact, col }: { contact: ContactRow; col: ColKey }) {
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
        <a href={`tel:${contact.phone}`} className="text-[#2563eb] hover:underline">
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
  }
}
