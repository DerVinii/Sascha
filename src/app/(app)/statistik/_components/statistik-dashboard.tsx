"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  RefreshCw,
  Reply,
  Rocket,
  Send,
  Target,
} from "lucide-react";
import {
  campaignStatusBadge,
  fmtCompact,
  fmtEur,
  fmtInt,
  fmtDayLabel,
  fmtPct,
  pct,
  RANGE_OPTIONS,
  type CampaignRow,
  type DailyPoint,
  type Range,
  type StatOverview,
  type StatusCounts,
  type Tone,
} from "@/lib/statistik-ui";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  err: "bg-err/10 text-err border-err/30",
  info: "bg-info/10 text-info border-info/30",
  muted: "bg-bg text-sub border-line",
};

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

export function StatistikDashboard({
  overview,
  daily,
  campaigns,
  statusCounts,
  range,
  rangeLabel,
  error,
  rateLimited,
}: {
  overview: StatOverview;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
  statusCounts: StatusCounts;
  range: Range;
  rangeLabel: string;
  error: string | null;
  rateLimited: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function setRange(v: Range) {
    startTransition(() => router.push(`${pathname}?range=${v}`));
  }

  const contacted = overview.contacted;
  const noData = overview.emailsSent === 0 && overview.contacted === 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Fehler-/Hinweis-Banner */}
      {error ? (
        <Banner
          tone={rateLimited ? "warn" : "err"}
          icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
          onReload={() => router.refresh()}
        >
          {rateLimited
            ? "Instantly drosselt gerade die Anfragen (Rate-Limit). Bitte in einer Minute erneut laden."
            : `Instantly-API nicht erreichbar: ${error}`}
        </Banner>
      ) : (
        noData && (
          <div className="rounded-xl border border-accent-line bg-accent-faint px-4 py-3 text-sm text-accent-ink flex items-start gap-3">
            <Rocket className="h-5 w-5 shrink-0 text-accent" />
            <div>
              <div className="font-semibold">Noch keine Versanddaten</div>
              <p className="mt-0.5 text-[13px] text-accent-ink/80">
                Im verbundenen Instantly-Workspace wurde im gewählten Zeitraum
                noch nichts gesendet. Sobald deine erste Kampagne startet,
                füllen sich Kennzahlen, Trichter und Verlauf hier automatisch.
              </p>
            </div>
          </div>
        )
      )}

      {/* KPI-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          icon={Send}
          iconClass="text-accent"
          label="Gesendet"
          value={fmtCompact(overview.emailsSent)}
          title={fmtInt(overview.emailsSent) + " E-Mails"}
        />
        <Kpi
          icon={Reply}
          iconClass="text-ok"
          label="Antwortrate"
          value={fmtPct(pct(overview.replyUnique, contacted))}
          title={`${fmtInt(overview.replyUnique)} eindeutige Antworten`}
        />
        <Kpi
          icon={Target}
          iconClass={overview.opportunities > 0 ? "text-ok" : "text-accent"}
          label="Chancen"
          value={fmtInt(overview.opportunities)}
          sub={fmtEur(overview.opportunityValue)}
        />
      </div>

      {/* Trichter (Kopf aus Instantly, Rest aus dem CRM-Kontaktstatus) */}
      <FunnelStrip overview={overview} statusCounts={statusCounts} />

      {/* Verlaufs-Chart */}
      <div
        className={`rounded-xl border border-line bg-surface overflow-hidden transition-opacity ${
          pending ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Versandverlauf</h2>
          <RangeControl range={range} onChange={setRange} pending={pending} />
        </div>
        <div className="p-4">
          <TrendChart daily={daily} />
        </div>
      </div>

      {/* Kampagnen-Tabelle */}
      <CampaignTable campaigns={campaigns} />

      {/* Fußnote */}
      <p className="text-[11px] text-sub leading-relaxed">
        Versand-, Antwort- und Chancen-Zahlen kommen live aus Instantly
        (Zeitraum: {rangeLabel}); Antwortrate bezogen auf kontaktierte Leads.
        Die Trichter-Stufen Interessiert, Termine und Gewonnen stammen aus dem
        CRM-Kontaktstatus (org-weit, aktueller Stand) – nur dort werden sie
        gepflegt.
      </p>
    </div>
  );
}

// --- KPI-Karte ---------------------------------------------------------------

function Kpi({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: string;
  sub?: string;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-sub">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <span className="truncate">{label}</span>
      </div>
      <div
        className="mt-1 text-xl font-semibold text-ink tabular-nums"
        title={title}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-sub tabular-nums">{sub}</div>}
    </div>
  );
}

// --- Trichter ----------------------------------------------------------------

function FunnelStrip({
  overview,
  statusCounts,
}: {
  overview: StatOverview;
  statusCounts: StatusCounts;
}) {
  const c = overview.contacted;
  const interessiert = statusCounts.qualified + statusCounts.in_conversation;
  const termine = statusCounts.meeting_booked;
  const gewonnen = statusCounts.won;

  const stages: {
    label: string;
    value: number;
    sub: string;
    from: "Instantly" | "CRM";
    win?: boolean;
  }[] = [
    { label: "Kontaktiert", value: c, sub: c > 0 ? "100 %" : "–", from: "Instantly" },
    {
      label: "Geantwortet",
      value: overview.replyUnique,
      sub: fmtPct(pct(overview.replyUnique, c), 1),
      from: "Instantly",
    },
    {
      label: "Interessiert",
      value: interessiert,
      sub: fmtPct(pct(interessiert, c), 1),
      from: "CRM",
    },
    {
      label: "Termine",
      value: termine,
      sub: fmtPct(pct(termine, c), 1),
      from: "CRM",
    },
    {
      label: "Gewonnen",
      value: gewonnen,
      sub: fmtPct(pct(gewonnen, c), 1),
      from: "CRM",
      win: true,
    },
  ];

  // Balken relativ zur größten Stufe, damit sie auch dann sichtbar sind, wenn
  // Instantly noch leer ist, das CRM aber schon gepflegte Kontakte hat.
  const denom = Math.max(1, ...stages.map((s) => s.value));
  const allZero = stages.every((s) => s.value === 0);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-0 overflow-x-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-1 gap-3 lg:gap-0">
          {stages.map((s, i) => {
            const width = Math.min(100, (s.value / denom) * 100);
            return (
              <div key={s.label} className="lg:flex-1 lg:flex lg:items-center">
                <div className="min-w-0 lg:flex-1 lg:px-3">
                  <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-sub">
                    <span className="truncate">{s.label}</span>
                    {s.from === "CRM" && (
                      <span
                        className="text-[9px] font-medium text-accent/70 normal-case"
                        title="Quelle: CRM-Kontaktstatus"
                      >
                        CRM
                      </span>
                    )}
                  </div>
                  <div
                    className={`mt-0.5 text-base font-semibold tabular-nums ${
                      s.win && s.value > 0 ? "text-ok" : "text-ink"
                    }`}
                  >
                    {allZero ? "–" : fmtInt(s.value)}
                  </div>
                  <div className="text-[11px] text-sub tabular-nums">{s.sub}</div>
                  <div className="mt-1.5 h-1 rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: width > 0 ? `max(${width}%, 2px)` : "0%" }}
                    />
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <ChevronRight className="hidden lg:block h-3.5 w-3.5 text-line shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {allZero && (
        <p className="mt-3 text-[11px] text-sub text-center">
          Noch keine Daten – der Trichter füllt sich mit dem Versand (Instantly)
          und dem gepflegten Kontaktstatus (CRM).
        </p>
      )}
    </div>
  );
}

// --- Chart -------------------------------------------------------------------

// Nur getrackte Reihen: Öffnungen/Klicks werden nicht erfasst und daher nicht
// gezeigt. Beide Reihen sind immer sichtbar (keine Auswahl).
const SERIES: {
  key: string;
  label: string;
  get: (d: DailyPoint) => number;
  color: string; // CSS-Var-Name, z. B. --c-accent
  area?: boolean;
}[] = [
  { key: "sent", label: "Gesendet", get: (d) => d.sent, color: "--c-accent", area: true },
  { key: "replies", label: "Antworten", get: (d) => d.replies, color: "--c-ok" },
];

const VB_W = 720;
const VB_H = 260;
const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 22;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;

/** Achsen-Skala mit „schönem" Schritt (1/2/5·10ⁿ) → glatte Integer-Labels. */
function niceScale(rawMax: number): { max: number; ticks: number[] } {
  const max = Math.max(5, rawMax);
  const rawStep = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow;
  const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * pow;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(v);
  return { max: niceMax, ticks };
}

function TrendChart({ daily }: { daily: DailyPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = daily.length;
  const activeSeries = SERIES;

  const { max: niceMax, ticks } = useMemo(() => {
    let raw = 0;
    for (const d of daily) {
      for (const s of SERIES) raw = Math.max(raw, s.get(d));
    }
    return niceScale(raw);
  }, [daily]);

  const hasData = useMemo(
    () => daily.some((d) => SERIES.some((s) => s.get(d) > 0)),
    [daily],
  );

  function x(i: number): number {
    if (n <= 1) return PAD_L + PLOT_W / 2;
    return PAD_L + (i * PLOT_W) / (n - 1);
  }
  function y(v: number): number {
    return PAD_T + PLOT_H * (1 - v / niceMax);
  }

  function linePath(get: (d: DailyPoint) => number): string {
    if (n === 0) return "";
    return daily
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(get(d)).toFixed(2)}`)
      .join(" ");
  }
  function areaPath(get: (d: DailyPoint) => number): string {
    if (n === 0) return "";
    return (
      linePath(get) +
      ` L ${x(n - 1).toFixed(2)} ${BASE_Y} L ${x(0).toFixed(2)} ${BASE_Y} Z`
    );
  }

  function onMove(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
    let i =
      n <= 1
        ? 0
        : Math.round(((svgX - PAD_L) / PLOT_W) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setHover(i);
  }

  const xStep = Math.max(1, Math.ceil(n / 6));

  const hoverPoint = hover != null ? daily[hover] : null;
  const hoverLeftPct = hover != null ? (x(hover) / VB_W) * 100 : 0;
  const flip = hoverLeftPct > 55;

  return (
    <div>
      {/* Legende (statisch – beide Reihen immer sichtbar) */}
      <div className="flex flex-wrap gap-4 mb-3">
        {SERIES.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sub"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `rgb(var(${s.color}))` }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Plot — auf schmalen Handys waagerecht scrollbar: bei voller
          Breite skaliert das SVG so stark herunter, dass Achsen- und
          Datumsbeschriftungen unlesbar werden. Ab md greift die
          Mindestbreite nicht mehr → Desktop unverändert. */}
      <div className="overflow-x-auto scroll-sichtbar">
        <div className="relative min-w-[560px] md:min-w-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full aspect-[720/260] select-none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity="0.22" />
                <stop offset="100%" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Y-Grid + Labels */}
            {ticks.map((v) => {
              const gy = y(v);
              return (
                <g key={v}>
                  <line
                    x1={PAD_L}
                    y1={gy}
                    x2={VB_W - PAD_R}
                    y2={gy}
                    stroke="rgb(var(--c-line))"
                    strokeOpacity={0.6}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_L - 6}
                    y={gy + 3}
                    textAnchor="end"
                    className="fill-sub"
                    style={{ fontSize: 10 }}
                  >
                    {fmtCompact(v)}
                  </text>
                </g>
              );
            })}

            {/* X-Ticks */}
            {daily.map((d, i) =>
              i % xStep === 0 ? (
                <text
                  key={d.date}
                  x={x(i)}
                  y={VB_H - 6}
                  textAnchor="middle"
                  className="fill-sub"
                  style={{ fontSize: 10 }}
                >
                  {fmtDayLabel(d.date)}
                </text>
              ) : null,
            )}

            {hasData && (
              <>
                {/* Flächen (nur „Gesendet") */}
                {activeSeries
                  .filter((s) => s.area)
                  .map((s) => (
                    <path key={`area-${s.key}`} d={areaPath(s.get)} fill="url(#sentGrad)" />
                  ))}

                {/* Linien */}
                {activeSeries.map((s) =>
                  n === 1 ? (
                    <circle
                      key={`pt-${s.key}`}
                      cx={x(0)}
                      cy={y(s.get(daily[0]))}
                      r={3}
                      fill={`rgb(var(${s.color}))`}
                    />
                  ) : (
                    <path
                      key={`line-${s.key}`}
                      d={linePath(s.get)}
                      fill="none"
                      stroke={`rgb(var(${s.color}))`}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ),
                )}
              </>
            )}

            {/* Hover-Führungslinie + Punkte */}
            {hoverPoint && hasData && (
              <>
                <line
                  x1={x(hover!)}
                  y1={PAD_T}
                  x2={x(hover!)}
                  y2={BASE_Y}
                  stroke="rgb(var(--c-accent))"
                  strokeOpacity={0.4}
                  strokeWidth={1}
                />
                {activeSeries.map((s) => (
                  <circle
                    key={`hp-${s.key}`}
                    cx={x(hover!)}
                    cy={y(s.get(hoverPoint))}
                    r={2.5}
                    fill={`rgb(var(${s.color}))`}
                  />
                ))}
              </>
            )}
          </svg>

          {/* Leer-Overlay */}
          {!hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
              <BarChart3 className="h-8 w-8 text-sub/40" />
              <div className="text-sm text-sub">
                Noch keine Versanddaten im gewählten Zeitraum.
              </div>
              <div className="text-[11px] text-sub">
                Sobald deine erste Kampagne sendet, erscheint hier der Verlauf.
              </div>
            </div>
          )}

          {/* Tooltip */}
          {hoverPoint && hasData && (
            <div
              className="absolute top-1 z-10 pointer-events-none rounded-lg border border-line bg-surface shadow-lg px-3 py-2 text-xs min-w-[9rem]"
              style={{
                left: `${hoverLeftPct}%`,
                transform: flip
                  ? "translateX(calc(-100% - 10px))"
                  : "translateX(10px)",
              }}
            >
              <div className="text-sub mb-1">{fmtDayLabel(hoverPoint.date)}</div>
              <div className="space-y-0.5">
                {activeSeries.map((s) => (
                  <div
                    key={`tt-${s.key}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="inline-flex items-center gap-1.5 text-sub">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: `rgb(var(${s.color}))` }}
                      />
                      {s.label}
                    </span>
                    <span className="font-medium text-ink tabular-nums">
                      {fmtInt(s.get(hoverPoint))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tabs + Kampagnentabelle -------------------------------------------------

type SortKey = "contacted" | "replyRate" | "bounceRate" | "opportunities";

function CampaignTable({ campaigns }: { campaigns: CampaignRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "contacted",
    dir: "desc",
  });

  const rows = useMemo(() => {
    const val = (c: CampaignRow, key: SortKey): number => {
      switch (key) {
        case "contacted":
          return c.contacted;
        case "replyRate":
          return pct(c.replyCount, c.contacted) ?? -1;
        case "bounceRate":
          return pct(c.bounced, c.emailsSent) ?? -1;
        case "opportunities":
          return c.opportunities;
      }
    };
    const sorted = [...campaigns].sort((a, b) => {
      const d = val(b, sort.key) - val(a, sort.key);
      const primary = sort.dir === "desc" ? d : -d;
      if (primary !== 0) return primary;
      return b.emailsSent - a.emailsSent; // Tiebreak: meiste Sends zuerst
    });
    return sorted;
  }, [campaigns, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" },
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-sub border-b border-line bg-bg/50">
              <th className="px-4 py-2.5 font-medium">Kampagne</th>
              <SortableTh
                label="Sequenz gestartet"
                sort={sort}
                onSort={toggleSort}
                sortKey="contacted"
              />
              <SortableTh
                label="Geantwortet"
                sort={sort}
                onSort={toggleSort}
                sortKey="replyRate"
              />
              <SortableTh
                label="Bounce"
                sort={sort}
                onSort={toggleSort}
                sortKey="bounceRate"
              />
              <SortableTh
                label="Chancen"
                sort={sort}
                onSort={toggleSort}
                sortKey="opportunities"
              />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sub">
                  Noch keine Kampagnen im Instantly-Workspace.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const badge = campaignStatusBadge(c.status);
              const replyRate = pct(c.replyCount, c.contacted);
              const bounceRate = pct(c.bounced, c.emailsSent);
              const bounceTone =
                bounceRate == null
                  ? "text-sub"
                  : bounceRate > 5
                    ? "text-err"
                    : bounceRate >= 2
                      ? "text-warn"
                      : "text-sub";
              return (
                <tr
                  key={c.id}
                  className="border-b border-line/60 last:border-0 hover:bg-bg/50"
                >
                  <td className="px-4 py-2.5">
                    <div
                      className="font-medium text-ink truncate max-w-[220px]"
                      title={c.name}
                    >
                      {c.name}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Pill label={badge.label} tone={badge.tone} />
                      {c.isEvergreen && (
                        <span className="text-[10px] text-sub">Evergreen</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink tabular-nums">
                    {fmtInt(c.contacted)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    <span className="text-ink">{fmtInt(c.replyCount)}</span>{" "}
                    <span className="text-[11px] text-sub">
                      · {fmtPct(replyRate, 1)}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 tabular-nums ${bounceTone}`}>
                    {fmtPct(bounceRate, 1)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    <span
                      className={
                        c.opportunities > 0
                          ? "text-ok font-semibold"
                          : "text-sub"
                      }
                      title={`${fmtEur(c.opportunityValue)} Pipeline-Wert`}
                    >
                      {fmtInt(c.opportunities)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sort,
  sortKey,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className="px-3 py-2.5 font-medium"
      aria-sort={
        active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"
      }
    >
      {/* py/-my: vergrößert nur die Fingerfläche, die Kopfzeile bleibt gleich hoch. */}
      <button
        onClick={() => onSort(sortKey)}
        aria-label={`Nach ${label} sortieren`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition py-2.5 -my-2.5 ${
          active ? "text-ink" : "hover:text-ink"
        }`}
      >
        {label}
        {active &&
          (sort.dir === "desc" ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}

// --- Kleinteile --------------------------------------------------------------

function RangeControl({
  range,
  onChange,
  pending,
}: {
  range: Range;
  onChange: (v: Range) => void;
  pending: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5">
      {pending && (
        <Loader2 className="h-3.5 w-3.5 text-sub animate-spin mx-1" />
      )}
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 md:h-8 px-3 text-xs rounded-md transition ${
            range === o.value
              ? "bg-accent text-white shadow-sm"
              : "text-sub hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
  onReload,
}: {
  tone: "err" | "warn";
  icon: React.ReactNode;
  children: React.ReactNode;
  onReload: () => void;
}) {
  const cls =
    tone === "warn"
      ? "border-warn/30 bg-warn/5 text-warn"
      : "border-err/30 bg-err/5 text-err";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3 ${cls}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="min-w-0">{children}</span>
      </div>
      <button
        onClick={onReload}
        className="shrink-0 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-current/30 hover:bg-current/10 transition text-xs font-medium"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Neu laden
      </button>
    </div>
  );
}
