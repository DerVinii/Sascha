"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarX,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  disconnectGoogleAction,
  syncGoogleAction,
} from "@/app/(app)/kalender/actions";

function fmtWhen(iso: string | null): string {
  if (!iso) return "noch nie";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "unbekannt";
  }
}

const FEHLER_TEXT: Record<string, string> = {
  nicht_konfiguriert:
    "Google ist serverseitig noch nicht eingerichtet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen).",
  state: "Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.",
};

export function GoogleConnectionCard({
  configured,
  connected,
  email,
  lastSyncedAt,
  lastError,
  flashConnected,
  flashError,
}: {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  flashConnected: boolean;
  flashError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  function sync() {
    setSyncMsg(null);
    startTransition(async () => {
      const r = await syncGoogleAction();
      if (r.error) setSyncMsg(`Fehler: ${r.error}`);
      else
        setSyncMsg(
          `Abgeglichen: ${r.imported} neu, ${r.updated} geändert, ${r.deleted} entfernt.`,
        );
      router.refresh();
    });
  }

  function disconnect() {
    if (!confirm("Google-Kalender-Verbindung wirklich trennen?")) return;
    startTransition(async () => {
      await disconnectGoogleAction();
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">Google Kalender</h2>
      <p className="text-xs text-sub mb-4">
        Termine werden beidseitig synchronisiert: Google-Termine erscheinen im
        Kalender, und hier angelegte Termine landen in Google.
      </p>

      {flashConnected && (
        <Banner tone="ok" icon={CheckCircle2}>
          Verbindung hergestellt. Der erste Abgleich ist gelaufen.
        </Banner>
      )}
      {flashError && (
        <Banner tone="err" icon={AlertTriangle}>
          {FEHLER_TEXT[flashError] ?? `Verbindung fehlgeschlagen: ${flashError}`}
        </Banner>
      )}

      {!configured && (
        <Banner tone="warn" icon={AlertTriangle}>
          Serverseitig noch nicht eingerichtet. Es fehlen die Umgebungsvariablen
          <span className="font-mono"> GOOGLE_CLIENT_ID</span> und
          <span className="font-mono"> GOOGLE_CLIENT_SECRET</span>.
        </Banner>
      )}

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CalendarCheck className="h-5 w-5 text-ok shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-sm text-ink font-medium">
                Verbunden{email ? ` · ${email}` : ""}
              </div>
              <div className="text-xs text-sub">
                Letzter Abgleich: {fmtWhen(lastSyncedAt)}
              </div>
              {lastError && (
                <div className="text-xs text-err mt-1">
                  Letzter Fehler: {lastError}
                </div>
              )}
            </div>
          </div>

          {syncMsg && <p className="text-xs text-sub">{syncMsg}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={sync}
              disabled={pending}
              className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-line bg-bg/40 text-sm text-ink hover:border-sub disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
              Jetzt synchronisieren
            </button>
            <button
              onClick={disconnect}
              disabled={pending}
              className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-line text-sm text-err hover:bg-err/10 disabled:opacity-60"
            >
              <CalendarX className="h-4 w-4" />
              Verbindung trennen
            </button>
          </div>
        </div>
      ) : (
        <a
          href="/api/google/connect"
          aria-disabled={!configured}
          className={`h-9 px-4 inline-flex items-center gap-2 rounded-md text-sm font-medium transition ${
            configured
              ? "bg-accent text-accent-ink hover:opacity-90"
              : "bg-bg/40 border border-line text-sub pointer-events-none opacity-60"
          }`}
        >
          <CalendarCheck className="h-4 w-4" />
          Mit Google verbinden
        </a>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "ok" | "err" | "warn";
  icon: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-ok/10 text-ok"
      : tone === "err"
        ? "bg-err/10 text-err"
        : "bg-warn/10 text-warn";
  return (
    <div className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${cls}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
