"use client";

import { useState, useTransition } from "react";
import {
  PUSH_EVENTS,
  PUSH_EVENT_GROUPS,
  isPushEventEnabled,
  type PushEventKey,
  type PushEventPrefs,
} from "@/lib/notification-events";
import { savePushEventsAction } from "../benachrichtigungen/actions";

/**
 * Auswahl, welche Ereignisse eine Push-Benachrichtigung auslösen. Gespeichert
 * wird pro Organisation, nicht pro Gerät — die Auswahl gilt also überall.
 */
export function NotificationEvents({ prefs }: { prefs: PushEventPrefs }) {
  // Vollständige Map aufbauen: fehlende Keys stehen auf ihrer Voreinstellung,
  // damit die Schalter genau das zeigen, was der Server tatsächlich tut.
  const [aktiv, setAktiv] = useState<Record<PushEventKey, boolean>>(
    () =>
      Object.fromEntries(
        PUSH_EVENTS.map((e) => [e.key, isPushEventEnabled(prefs, e.key)]),
      ) as Record<PushEventKey, boolean>,
  );
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  function umschalten(key: PushEventKey) {
    const vorher = aktiv;
    const nachher = { ...aktiv, [key]: !aktiv[key] };
    setAktiv(nachher); // optimistisch — der Schalter darf nicht hängen bleiben
    setFehler(null);
    setGespeichert(false);
    startTransition(async () => {
      try {
        await savePushEventsAction(nachher);
        setGespeichert(true);
      } catch {
        setAktiv(vorher); // zurückdrehen, sonst zeigt die Seite etwas Falsches
        setFehler("Konnte nicht gespeichert werden. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {PUSH_EVENT_GROUPS.map((gruppe) => {
        const eintraege = PUSH_EVENTS.filter((e) => e.group === gruppe);
        if (eintraege.length === 0) return null;
        return (
          <div key={gruppe}>
            <div className="text-[11px] uppercase tracking-wide text-sub mb-1.5">
              {gruppe}
            </div>
            <div className="rounded-lg border border-line divide-y divide-line">
              {eintraege.map((e) => {
                const an = aktiv[e.key];
                return (
                  <label
                    key={e.key}
                    className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">
                        {e.label}
                      </div>
                      <div className="text-[11px] text-sub">{e.hint}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={an}
                      aria-label={e.label}
                      onClick={() => umschalten(e.key)}
                      disabled={pending}
                      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
                        an ? "bg-brand" : "bg-line"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                          an ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-sub">
        Die Auswahl gilt für alle angemeldeten Geräte. Abgewählte Ereignisse
        werden gar nicht erst verschickt.
        {gespeichert && !pending && (
          <span className="text-ok"> Gespeichert.</span>
        )}
      </p>
      {fehler && <p className="text-xs text-err">{fehler}</p>}
    </div>
  );
}
