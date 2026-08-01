"use client";

import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Columns3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Settings,
  LayoutList,
  Columns as ColumnsIcon,
} from "lucide-react";
import { NewDealModal, type ContactOption } from "@/app/(app)/crm/_components/new-deal-modal";
import {
  PipelineManagerModal,
  type ManagerStage,
} from "@/app/(app)/crm/_components/pipeline-manager-modal";
import {
  ContactDrawerProvider,
  useContactDrawer,
} from "@/components/crm/contact-drawer";
import { DealBoard } from "./deal-board";

export type DetailStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
};

export type DetailDeal = {
  id: string;
  title: string;
  valueEur: number | null;
  stageId: string;
  contactId: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string | null;
  lastContactAt: string | null;
  companyName: string | null;
};

const BLUE = "bg-accent hover:bg-accent-hover text-white";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(", ", " - ");
}

export function PipelineDetail(props: {
  pipelineId: string;
  pipelineName: string;
  stages: DetailStage[];
  deals: DetailDeal[];
  contacts: ContactOption[];
  pipelineCount: number;
}) {
  // Provider mountet das Kontakt-Einschiebefenster für Tabelle & Board.
  return (
    <ContactDrawerProvider>
      <PipelineDetailInner {...props} />
    </ContactDrawerProvider>
  );
}

function PipelineDetailInner({
  pipelineId,
  pipelineName,
  stages,
  deals,
  contacts,
  pipelineCount,
}: {
  pipelineId: string;
  pipelineName: string;
  stages: DetailStage[];
  deals: DetailDeal[];
  contacts: ContactOption[];
  pipelineCount: number;
}) {
  const { open: openContact } = useContactDrawer();
  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );
  const [activeStageId, setActiveStageId] = useState(ordered[0]?.id ?? "");
  const [view, setView] = useState<"table" | "board">("table");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState({
    firstName: true,
    lastName: true,
    firma: true,
    createdAt: true,
    phone: true,
    email: true,
    lastContactAt: true,
  });

  const countByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) m.set(d.stageId, (m.get(d.stageId) ?? 0) + 1);
    return m;
  }, [deals]);

  const managerStages: ManagerStage[] = ordered.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    color: s.color,
    dealCount: countByStage.get(s.id) ?? 0,
  }));

  const pipelineForModal = [
    {
      id: pipelineId,
      name: pipelineName,
      stages: ordered.map((s) => ({ id: s.id, name: s.name })),
    },
  ];

  const stageDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals
      .filter((d) => d.stageId === activeStageId)
      .filter((d) =>
        !q
          ? true
          : [d.firstName, d.lastName, d.companyName, d.email, d.phone, d.title]
              .filter(Boolean)
              .some((v) => (v as string).toLowerCase().includes(q)),
      );
  }, [deals, activeStageId, query]);

  const totalPages = Math.max(1, Math.ceil(stageDeals.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const rows = stageDeals.slice(start, start + perPage);

  const COLS = [
    { key: "firstName", label: "Vorname" },
    { key: "lastName", label: "Nachname" },
    { key: "firma", label: "Firma" },
    { key: "createdAt", label: "Deal erstellt am" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "E-Mail" },
    { key: "lastContactAt", label: "Zuletzt kontaktiert" },
  ] as const;
  const cols = COLS.filter((c) => visible[c.key]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Kopf */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink min-w-0">
          {pipelineName}{" "}
          <span className="text-sm font-normal text-sub">
            {deals.length} Datensätze
          </span>
        </h2>
        <PipelineManagerModal
          pipelineId={pipelineId}
          pipelineName={pipelineName}
          stages={managerStages}
          pipelineCount={pipelineCount}
          trigger={(open) => (
            <button
              onClick={open}
              className="h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Pipeline-Einstellungen</span>
            </button>
          )}
        />
      </div>

      <div className="rounded-xl border border-line bg-surface">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="relative flex-1 min-w-[180px]">
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

          <div className="relative">
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
                <div className="absolute left-0 sm:left-auto sm:right-0 top-10 z-20 w-48 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-md shadow-lg p-1.5">
                  {COLS.map((c) => (
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
              </>
            )}
          </div>

          {/* Ansicht-Umschalter */}
          <div className="inline-flex items-center rounded-md border border-line bg-surface p-0.5">
            <button
              onClick={() => setView("table")}
              className={`h-8 px-2.5 text-xs font-medium rounded inline-flex items-center gap-1.5 transition ${
                view === "table" ? "bg-sidebar text-white" : "text-sub hover:text-ink"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Tabelle
            </button>
            <button
              onClick={() => setView("board")}
              className={`h-8 px-2.5 text-xs font-medium rounded inline-flex items-center gap-1.5 transition ${
                view === "board" ? "bg-sidebar text-white" : "text-sub hover:text-ink"
              }`}
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
              Board
            </button>
          </div>

          <NewDealModal
            pipelines={pipelineForModal}
            contacts={contacts}
            defaultPipelineId={pipelineId}
            defaultStageId={activeStageId || ordered[0]?.id}
            trigger={(open) => (
              <button
                onClick={open}
                className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition ${BLUE}`}
              >
                + Deal erstellen
              </button>
            )}
          />
        </div>

        {view === "board" ? (
          <div className="p-3">
            <DealBoard
              stages={ordered}
              deals={deals.map((d) => ({
                id: d.id,
                title: d.title,
                valueEur: d.valueEur,
                stageId: d.stageId,
                contactId: d.contactId,
                contactName:
                  [d.firstName, d.lastName].filter(Boolean).join(" ") || null,
                companyName: d.companyName,
              }))}
            />
          </div>
        ) : (
          <>
            {/* Phasen-Tabs */}
            <div className="flex items-center gap-1 px-3 pt-2 overflow-x-auto border-b border-line">
              {ordered.map((s) => {
                const active = s.id === activeStageId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveStageId(s.id);
                      setPage(1);
                    }}
                    className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition inline-flex items-center gap-2 ${
                      active
                        ? "border-accent text-ink"
                        : "border-transparent text-sub hover:text-ink"
                    }`}
                  >
                    {s.name}
                    <span
                      className={`text-[11px] rounded-full px-1.5 py-0.5 ${
                        active ? "bg-accent-soft text-accent-ink" : "bg-bg text-sub"
                      }`}
                    >
                      {countByStage.get(s.id) ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tabelle */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg/40 border-b border-line text-left text-[12px] text-sub">
                  <tr>
                    <th className="px-4 py-3 w-10"></th>
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
                        Keine Deals in dieser Phase.
                      </td>
                    </tr>
                  ) : (
                    rows.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => d.contactId && openContact(d.contactId)}
                        onKeyDown={
                          d.contactId
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openContact(d.contactId as string);
                                }
                              }
                            : undefined
                        }
                        tabIndex={d.contactId ? 0 : undefined}
                        role={d.contactId ? "button" : undefined}
                        aria-label={
                          d.contactId
                            ? `Kontakt ${
                                [d.firstName, d.lastName]
                                  .filter(Boolean)
                                  .join(" ") ||
                                d.email ||
                                ""
                              } öffnen`
                            : undefined
                        }
                        className={`hover:bg-bg/50 transition ${
                          d.contactId
                            ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                            : ""
                        }`}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input type="checkbox" aria-label="Auswählen" />
                        </td>
                        {cols.map((col) => (
                          <td
                            key={col.key}
                            className="px-4 py-3 whitespace-nowrap"
                          >
                            <DealCell deal={d} col={col.key} />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span>
                  Zeige {stageDeals.length === 0 ? 0 : start + 1}–
                  {Math.min(start + perPage, stageDeals.length)} von{" "}
                  {stageDeals.length} Deals
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
          </>
        )}
      </div>
    </div>
  );
}

function DealCell({
  deal,
  col,
}: {
  deal: DetailDeal;
  col:
    | "firstName"
    | "lastName"
    | "firma"
    | "createdAt"
    | "phone"
    | "email"
    | "lastContactAt";
}) {
  switch (col) {
    case "firstName":
      return (
        <span className="font-medium text-ink hover:underline">
          {deal.firstName || "—"}
        </span>
      );
    case "lastName":
      return <span className="text-ink">{deal.lastName || "—"}</span>;
    case "firma":
      return (
        <span className="text-ink">{deal.companyName || "—"}</span>
      );
    case "createdAt":
      return <span className="text-sub">{fmtDateTime(deal.createdAt)}</span>;
    case "phone":
      return deal.phone ? (
        <a
          href={`tel:${deal.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="text-accent-ink hover:underline"
        >
          {deal.phone}
        </a>
      ) : (
        <span className="text-sub">—</span>
      );
    case "email":
      return deal.email ? (
        <a
          href={`mailto:${deal.email}`}
          onClick={(e) => e.stopPropagation()}
          className="text-ink hover:underline"
        >
          {deal.email}
        </a>
      ) : (
        <span className="text-sub">—</span>
      );
    case "lastContactAt":
      return <span className="text-sub">{fmtDateTime(deal.lastContactAt)}</span>;
  }
}
