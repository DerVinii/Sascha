"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, QrCode, X } from "lucide-react";

import { formatDateTime } from "@/lib/zeiterfassung";
import { createEnrollmentToken } from "../../../actions";

type Kopplung = { url: string; qr: string; expiresAt: string };

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
  // Der Klartext-Code kommt nur genau einmal vom Server — er lebt ausschließlich
  // in diesem State, solange der Dialog offen ist.
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
        setKopplung({ url: res.url, qr: res.qr, expiresAt: res.expiresAt });
        router.refresh();
      } catch {
        setFehler("QR-Code konnte nicht erzeugt werden. Bitte erneut versuchen.");
      }
    });
  }

  async function linkKopieren() {
    if (!kopplung) return;
    setKopierFehler(null);
    try {
      await navigator.clipboard.writeText(kopplung.url);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      setKopierFehler(
        "Kopieren hat nicht geklappt. Bitte den Link oben von Hand markieren.",
      );
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <h2 className="text-sm font-semibold text-ink">Gerät einrichten</h2>
      <p className="text-sm text-sub">
        Der Mitarbeiter scannt den Code mit der Handykamera und ist danach
        dauerhaft angemeldet. Ein Passwort braucht er nicht.
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
          <QrCode className="h-4 w-4" />
          {pending ? "Wird erzeugt …" : "QR-Code erzeugen"}
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
              dann nicht, wenn der neue QR-Code noch gar nicht gescannt wurde.
            </p>
            <p className="text-xs text-sub">
              Nur nötig, wenn das alte Handy verloren ging oder ersetzt wurde.
              Sonst den Haken entfernen: dann bleibt das alte Gerät angemeldet,
              bis der neue Code gescannt ist.
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
                {pending
                  ? "Wird erzeugt …"
                  : "Abmelden und Code erzeugen"}
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
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                QR-Code für {name}
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

            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kopplung.qr}
                alt="QR-Code zur Geräte-Einrichtung"
                className="w-56 h-56 rounded-md bg-white p-2"
              />
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-sub">
                Alternativ dieser Link
              </p>
              <p className="text-xs text-ink break-all select-all rounded-md border border-line bg-bg p-2">
                {kopplung.url}
              </p>
              <button
                type="button"
                onClick={linkKopieren}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg inline-flex items-center gap-1.5"
              >
                {kopiert ? (
                  <Check className="h-4 w-4 text-ok" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {kopiert ? "Kopiert" : "Link kopieren"}
              </button>
              {kopierFehler && (
                <p className="text-xs text-err">{kopierFehler}</p>
              )}
            </div>

            <p className="text-xs text-sub">
              24 Stunden gültig, nur einmal verwendbar — gültig bis{" "}
              {formatDateTime(kopplung.expiresAt)} Uhr. Sobald dieses Fenster
              geschlossen ist, lässt sich der Code nicht mehr anzeigen; dann muss
              ein neuer erzeugt werden.
            </p>

            <div className="flex justify-end pt-1">
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
