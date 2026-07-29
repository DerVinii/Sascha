"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, X } from "lucide-react";

import { formatDateTime } from "@/lib/zeiterfassung";
import { createEnrollmentToken } from "../../../actions";

type Kopplung = {
  /** Klartext, kommt genau einmal vom Server und lebt nur in diesem State. */
  code: string;
  url: string;
  qr: string;
  expiresAt: string;
};

export function QrEinrichtung({
  employeeId,
  name,
  aktiv,
  hatAktiveGeraete,
}: {
  employeeId: string;
  name: string;
  aktiv: boolean;
  hatAktiveGeraete: boolean;
}) {
  const router = useRouter();
  // Abmelden ist der Ausnahmefall (Handy verloren/ersetzt) — daher standardmäßig aus.
  const [alteAbmelden, setAlteAbmelden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  // Fehler beim Kopieren gehört in den Dialog — sonst liegt er unsichtbar darunter.
  const [kopierFehler, setKopierFehler] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [kopplung, setKopplung] = useState<Kopplung | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!kopplung) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape") setKopplung(null);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [kopplung]);

  useEffect(() => {
    if (!bestaetigen) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setBestaetigen(false);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [bestaetigen, pending]);

  const meldetAb = hatAktiveGeraete && alteAbmelden;

  function erzeugen() {
    setFehler(null);
    setKopiert(false);
    setKopierFehler(null);
    startTransition(async () => {
      try {
        const res = await createEnrollmentToken(employeeId, meldetAb);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setBestaetigen(false);
        setKopplung({
          code: res.code,
          url: res.url,
          qr: res.qr,
          expiresAt: res.expiresAt,
        });
        router.refresh();
      } catch {
        setFehler("Code konnte nicht erzeugt werden. Bitte erneut versuchen.");
      }
    });
  }

  async function codeKopieren() {
    if (!kopplung) return;
    setKopierFehler(null);
    try {
      await navigator.clipboard.writeText(kopplung.code);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      setKopierFehler(
        "Kopieren hat nicht geklappt. Bitte den Code von Hand abschreiben.",
      );
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <h2 className="text-sm font-semibold text-ink">Gerät einrichten</h2>
      <p className="text-sm text-sub">
        Der Mitarbeiter installiert die Stempeluhr als App auf seinem Handy und
        tippt dort den Code ein, den du ihm nennst. Ein Passwort braucht er
        nicht.
      </p>

      {hatAktiveGeraete && (
        <label className="flex items-start gap-2 text-sm text-ink select-none cursor-pointer">
          <input
            type="checkbox"
            checked={alteAbmelden}
            onChange={(e) => setAlteAbmelden(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line accent-accent"
          />
          <span>
            Bereits eingerichtete Geräte abmelden
            <span className="block text-xs text-sub">
              Empfohlen, wenn das alte Handy verloren ging oder ersetzt wurde.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (meldetAb) {
              setFehler(null);
              setBestaetigen(true);
              return;
            }
            erzeugen();
          }}
          disabled={pending || !aktiv}
          className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <KeyRound className="h-4 w-4" />
          {pending ? "Wird erzeugt …" : "Kopplungscode erzeugen"}
        </button>
        {!aktiv && (
          <span className="text-xs text-sub">
            Der Mitarbeiter ist deaktiviert und kann kein Gerät koppeln.
          </span>
        )}
      </div>

      {fehler && <p className="text-xs text-err">{fehler}</p>}

      {bestaetigen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setBestaetigen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3">
            <h2 className="text-sm font-semibold text-ink">
              Bisherige Geräte jetzt abmelden?
            </h2>
            <p className="text-sm text-ink">
              Das bisher gekoppelte Handy kann danach nicht mehr stempeln — auch
              dann nicht, wenn der neue Code noch gar nicht eingegeben wurde.
            </p>
            <p className="text-xs text-sub">
              Nur nötig, wenn das alte Handy verloren ging oder ersetzt wurde.
              Sonst den Haken entfernen: dann bleibt das alte Gerät angemeldet,
              bis der neue Code eingegeben ist.
            </p>
            {fehler && <p className="text-xs text-err">{fehler}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBestaetigen(false)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={erzeugen}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Wird erzeugt …" : "Abmelden und Code erzeugen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {kopplung && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setKopplung(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                Kopplungscode für {name}
              </h2>
              <button
                type="button"
                onClick={() => setKopplung(null)}
                aria-label="Schließen"
                className="text-sub hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Der Code ist die Hauptsache — groß genug zum Vorlesen. */}
            <div className="rounded-lg border border-accent-line bg-accent-faint p-4 text-center">
              <p className="text-[11px] font-medium text-sub">
                Diesen Code vorlesen
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.15em] text-ink select-all">
                {kopplung.code}
              </p>
              <button
                type="button"
                onClick={codeKopieren}
                className="mt-3 h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg inline-flex items-center gap-1.5"
              >
                {kopiert ? (
                  <Check className="h-4 w-4 text-ok" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {kopiert ? "Kopiert" : "Code kopieren"}
              </button>
              {kopierFehler && (
                <p className="mt-2 text-xs text-err">{kopierFehler}</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-ink">
                So geht der Mitarbeiter vor
              </p>
              <ol className="space-y-1.5 text-xs text-sub">
                <li>
                  <span className="font-medium text-ink">1.</span> Diesen
                  QR-Code mit der Handykamera scannen — er führt zur
                  Installationsanleitung.
                </li>
                <li>
                  <span className="font-medium text-ink">2.</span> Die
                  Stempeluhr als App auf den Startbildschirm legen.
                </li>
                <li>
                  <span className="font-medium text-ink">3.</span> Die App über
                  das neue Symbol öffnen und den Code oben eintippen.
                </li>
              </ol>
            </div>

            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kopplung.qr}
                alt="QR-Code zur Installationsanleitung"
                className="w-40 h-40 rounded-md bg-white p-2"
              />
            </div>

            <p className="text-center text-xs text-ink break-all select-all">
              {kopplung.url}
            </p>

            <p className="text-xs text-sub">
              Der Code ist 30 Minuten gültig (bis{" "}
              {formatDateTime(kopplung.expiresAt)} Uhr) und lässt sich nur
              einmal verwenden. Sobald dieses Fenster geschlossen ist, kann er
              nicht mehr angezeigt werden — dann einfach einen neuen erzeugen.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setKopplung(null)}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
