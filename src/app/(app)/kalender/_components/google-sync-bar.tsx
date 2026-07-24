"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Calendar } from "lucide-react";
import { syncGoogleAction } from "../actions";

const THROTTLE_MS = 2 * 60 * 1000; // Auto-Sync höchstens alle 2 Minuten
const STAMP_KEY = "google_sync_last";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return "—";
  }
}

export function GoogleSyncBar({
  connected,
  lastSyncedAt,
}: {
  connected: boolean;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const didAuto = useRef(false);

  function runSync(auto: boolean) {
    startTransition(async () => {
      const r = await syncGoogleAction();
      try {
        sessionStorage.setItem(STAMP_KEY, String(Date.now()));
      } catch {}
      if (!auto) {
        if (r.error) setNote(`Fehler: ${r.error}`);
        else setNote(`${r.imported + r.updated} aktualisiert, ${r.deleted} entfernt`);
      }
      router.refresh();
    });
  }

  // Beim Öffnen einmal automatisch abgleichen (gedrosselt).
  useEffect(() => {
    if (!connected || didAuto.current) return;
    didAuto.current = true;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(STAMP_KEY)) || 0;
    } catch {}
    if (Date.now() - last > THROTTLE_MS) runSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  if (!connected) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-sub">
        <Calendar className="h-3.5 w-3.5" />
        <span>Google Kalender nicht verbunden.</span>
        <Link
          href="/einstellungen/kalender"
          className="text-accent-ink underline underline-offset-2 hover:opacity-80"
        >
          Verbinden
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-sub">
      <Calendar className="h-3.5 w-3.5 text-ok" />
      <span>Google synchronisiert · zuletzt {fmtTime(lastSyncedAt)}</span>
      <button
        onClick={() => runSync(false)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-ink disabled:opacity-60"
        title="Jetzt synchronisieren"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        Sync
      </button>
      {note && <span className="text-sub/80">{note}</span>}
    </div>
  );
}
