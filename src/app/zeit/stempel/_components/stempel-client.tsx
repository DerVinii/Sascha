"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDateTime, formatTime } from "@/lib/zeiterfassung";
import { stempeln } from "../actions";

export type LetzterWechsel = {
  art: "ein" | "aus";
  /** ISO-String — Formatierung passiert hier in Berlin-Zeit. */
  zeitpunkt: string;
  /** Liegt der Wechsel auf dem heutigen Kalendertag (Berlin)? */
  heute: boolean;
};

/** Laufende Dauer als "1:23:45". */
function laufendeDauer(startIso: string, jetzt: number): string {
  const sekunden = Math.max(
    0,
    Math.floor((jetzt - new Date(startIso).getTime()) / 1000),
  );
  const h = Math.floor(sekunden / 3600);
  const m = Math.floor((sekunden % 3600) / 60);
  const s = sekunden % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StempelClient({
  laufendSeit,
  letzterWechsel,
}: {
  /** clockIn des laufenden Eintrags als ISO — null = ausgestempelt. */
  laufendSeit: string | null;
  letzterWechsel: LetzterWechsel | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  // Erst nach dem Mounten gesetzt: die Uhr des Handys darf nicht in das
  // Server-HTML einfließen, sonst gibt es einen Hydration-Mismatch.
  const [jetzt, setJetzt] = useState<number | null>(null);

  const eingestempelt = Boolean(laufendSeit);

  useEffect(() => {
    if (!laufendSeit) {
      setJetzt(null);
      return;
    }
    setJetzt(Date.now());
    const timer = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [laufendSeit]);

  function ausloesen() {
    if (pending) return;
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await stempeln(eingestempelt ? "aus" : "ein");
        if (!ergebnis.ok) {
          setFehler(ergebnis.error);
          return;
        }
        router.refresh();
      } catch {
        setFehler("Das hat nicht geklappt. Bitte noch einmal versuchen.");
      }
    });
  }

  const beschriftung = eingestempelt ? "Ausstempeln" : "Einstempeln";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={ausloesen}
        disabled={pending}
        aria-live="polite"
        className={cn(
          "w-full h-44 rounded-2xl text-2xl font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60",
          eingestempelt ? "bg-err" : "bg-accent",
        )}
      >
        <span className="block">
          {pending ? `${beschriftung} …` : beschriftung}
        </span>
        {eingestempelt && laufendSeit && (
          <span className="mt-2 block text-base font-medium tabular-nums opacity-90">
            {jetzt === null ? " " : laufendeDauer(laufendSeit, jetzt)}
          </span>
        )}
      </button>

      {fehler && <p className="text-sm text-err">{fehler}</p>}

      {letzterWechsel && (
        <p className="text-center text-xs text-sub">
          {letzterWechsel.art === "ein" ? "Eingestempelt" : "Ausgestempelt"}
          {letzterWechsel.heute
            ? ""
            : ` am ${formatDateTime(letzterWechsel.zeitpunkt, "dd.MM.")}`}{" "}
          um {formatTime(letzterWechsel.zeitpunkt)} Uhr
        </p>
      )}
    </div>
  );
}
