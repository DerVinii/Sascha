"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Flame,
  Mail,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import {
  ACCOUNT_STATUS,
  PROVIDER_LABEL,
  WARMUP_STATUS,
  type AccountRow,
} from "@/lib/instantly-ui";
import { pauseAccountAction, resumeAccountAction } from "../../actions";

const TONE_CLASSES: Record<string, string> = {
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  err: "bg-err/10 text-err border-err/30",
  muted: "bg-bg text-sub border-line",
};

function Pill({
  label,
  tone,
  title,
}: {
  label: string;
  tone: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        TONE_CLASSES[tone] ?? TONE_CLASSES.muted
      }`}
    >
      {label}
    </span>
  );
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-sub";
  if (score >= 90) return "text-ok";
  if (score >= 70) return "text-warn";
  return "text-err";
}

export function AccountsDashboard({
  accounts,
  error,
  statsError,
}: {
  accounts: AccountRow[];
  error: string | null;
  /** Versand-Statistik nicht abrufbar — Zahlen dann als „–" statt als 0 zeigen. */
  statsError?: string | null;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const active = accounts.filter((a) => a.status === 1).length;
  const errors = accounts.filter((a) => (a.status ?? 0) < 0).length;
  const scores = accounts
    .map((a) => a.healthScore)
    .filter((s): s is number => typeof s === "number");
  const avgScore = scores.length
    ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    : null;
  const warmupSent = accounts.reduce((s, a) => s + a.warmupSent, 0);
  const warmupInbox = accounts.reduce((s, a) => s + a.warmupInbox, 0);
  const inboxRate = warmupSent > 0 ? Math.round((warmupInbox / warmupSent) * 100) : null;
  const sent7 = accounts.reduce((s, a) => s + a.sent7, 0);
  const replies7 = accounts.reduce((s, a) => s + a.replies7, 0);

  function toggle(account: AccountRow) {
    setActionError(null);
    setPendingEmail(account.email);
    startTransition(async () => {
      try {
        if (account.status === 1) await pauseAccountAction(account.email);
        else await resumeAccountAction(account.email);
        router.refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Aktion fehlgeschlagen",
        );
      } finally {
        setPendingEmail(null);
      }
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {(error || actionError) && (
        <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err">
          {actionError ?? `Instantly-API: ${error}`}
        </div>
      )}

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Mail} label="Accounts" value={String(accounts.length)} />
        <Kpi icon={Activity} label="Aktiv" value={String(active)} />
        <Kpi
          icon={AlertTriangle}
          label="Fehler"
          value={String(errors)}
          tone={errors > 0 ? "err" : undefined}
        />
        <Kpi
          icon={Flame}
          label="Ø Health-Score"
          value={avgScore != null ? `${avgScore}%` : "–"}
        />
        <Kpi
          icon={Mail}
          label="Inbox-Rate (Warmup)"
          value={inboxRate != null ? `${inboxRate}%` : "–"}
        />
        <Kpi
          icon={Mail}
          label="Kampagne 7 T (Sent/Repl.)"
          value={statsError ? "–" : `${sent7}/${replies7}`}
        />
      </div>

      {/* Tabelle */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">
            Instantly Sending-Accounts
          </h2>
          <button
            onClick={() => router.refresh()}
            className="h-10 sm:h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-xs font-medium text-sub hover:text-ink hover:bg-bg transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aktualisieren
          </button>
        </div>
        {/* scroll-sichtbar: Die Tabelle hat neun Spalten — auf dem Handy ist
            der waagerechte Regler der einzige Hinweis auf den Rest. */}
        <div className="overflow-x-auto scroll-sichtbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-sub border-b border-line bg-bg/50">
                <th className="px-4 py-2.5 font-medium">Postfach</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Warmup</th>
                <th className="px-3 py-2.5 font-medium">Health</th>
                <th className="px-3 py-2.5 font-medium">Warmup 7 T</th>
                <th className="px-3 py-2.5 font-medium">Limit/Tag</th>
                <th className="px-3 py-2.5 font-medium">Kampagne</th>
                <th className="px-3 py-2.5 font-medium">Provider</th>
                <th className="px-3 py-2.5 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sub">
                    Keine Sending-Accounts im Instantly-Workspace gefunden.
                  </td>
                </tr>
              )}
              {accounts.map((a) => {
                const st = a.status != null ? ACCOUNT_STATUS[a.status] : null;
                const ws =
                  a.warmupStatus != null ? WARMUP_STATUS[a.warmupStatus] : null;
                return (
                  <tr
                    key={a.email}
                    className="border-b border-line/60 last:border-0 hover:bg-bg/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{a.email}</div>
                      {a.name && (
                        <div className="text-[11px] text-sub">{a.name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {st ? (
                        <Pill
                          label={st.label}
                          tone={st.tone}
                          title={a.statusMessage ?? undefined}
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {ws ? <Pill label={ws.label} tone={ws.tone} /> : "–"}
                    </td>
                    <td
                      className={`px-3 py-2.5 font-semibold ${scoreColor(
                        a.healthScore,
                      )}`}
                    >
                      {a.healthScore != null ? `${a.healthScore}%` : "–"}
                    </td>
                    <td className="px-3 py-2.5">
                      <WarmupBars days={a.last7} />
                    </td>
                    <td className="px-3 py-2.5 text-ink">
                      {a.dailyLimit ?? "–"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {statsError ? (
                        <span className="text-sub">–</span>
                      ) : (
                        <>
                          <div className="text-ink">
                            {a.sentToday} heute
                            {a.dailyLimit != null && (
                              <span className="text-sub">
                                {" "}
                                von {a.dailyLimit}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-sub">
                            {a.sent7} in 7 Tagen
                            {a.bounced7 > 0 && (
                              <span className="text-err">
                                {" "}
                                · {a.bounced7} Bounce
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sub">
                      {a.providerCode != null
                        ? (PROVIDER_LABEL[a.providerCode] ?? a.providerCode)
                        : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => toggle(a)}
                        disabled={pendingEmail === a.email}
                        title={
                          a.status === 1
                            ? "Versand pausieren"
                            : "Versand fortsetzen"
                        }
                        className="h-9 sm:h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-line text-[11px] font-medium text-sub hover:text-ink hover:bg-bg transition disabled:opacity-50"
                      >
                        {a.status === 1 ? (
                          <>
                            <Pause className="h-3 w-3" /> Pausieren
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" /> Fortsetzen
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {statsError && (
        <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          Versand-Statistik konnte nicht geladen werden: {statsError}
        </div>
      )}

      <p className="text-[11px] text-sub">
        Health-Score & Warmup-Daten kommen direkt aus Instantly. „Kampagne“
        zählt nur echten Kampagnen-Versand (kein Warmup). Balken bei „Warmup 7
        T“: grün = alles im Posteingang, orange = ein bis zwei Mails im Spam, rot
        = drei oder mehr.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "err";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-sub">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${
          tone === "err" && value !== "0" ? "text-err" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Ab so vielen Spam-Landungen an EINEM Tag gilt der Tag als kritisch (rot). */
const WARMUP_SPAM_CRITICAL = 3;

/**
 * Mini-Balken: Warmup-Zustellung der letzten 7 Tage. Grün = alles im Posteingang,
 * Orange = ein bis zwei Mails im Spam (im Warmup normal), Rot = ab drei.
 */
function WarmupBars({
  days,
}: {
  days: { date: string; sent: number; landedInbox: number; landedSpam: number }[];
}) {
  if (days.length === 0) return <span className="text-sub">–</span>;
  const max = Math.max(...days.map((d) => d.sent), 1);
  return (
    <div className="flex items-end gap-0.5 h-6" title="Warmup: gesendet/Inbox letzte 7 Tage">
      {days.map((d) => {
        const h = Math.max(Math.round((d.sent / max) * 24), 2);
        const color =
          d.landedSpam >= WARMUP_SPAM_CRITICAL
            ? "bg-err/70"
            : d.landedSpam > 0
              ? "bg-warn/70"
              : "bg-ok/70";
        return (
          <div
            key={d.date}
            className={`w-1.5 rounded-sm ${color}`}
            style={{ height: h }}
            title={`${d.date}: ${d.sent} gesendet, ${d.landedInbox} Inbox${
              d.landedSpam ? `, ${d.landedSpam} Spam` : ""
            }`}
          />
        );
      })}
    </div>
  );
}
