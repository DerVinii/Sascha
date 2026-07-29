"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { formatDateTime } from "@/lib/zeiterfassung";

export type Einladung = {
  url: string;
  qr: string;
  /** ISO-String */
  expiresAt: string;
};

/**
 * Zeigt einen fertigen Einladungslink zum Verschicken.
 *
 * Wird an zwei Stellen gebraucht (nach dem Anlegen eines Mitarbeiters und auf
 * der Detailseite), deshalb hier gemeinsam — sonst driften die Erklärtexte
 * auseinander, und genau die entscheiden, ob die Einrichtung klappt.
 */
export function EinladungAnzeige({
  name,
  einladung,
}: {
  name: string;
  einladung: Einladung;
}) {
  const [kopiert, setKopiert] = useState(false);
  const [kopierFehler, setKopierFehler] = useState<string | null>(null);

  async function kopieren() {
    setKopierFehler(null);
    try {
      await navigator.clipboard.writeText(einladung.url);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      setKopierFehler(
        "Kopieren hat nicht geklappt. Bitte den Link von Hand markieren.",
      );
    }
  }

  const vorname = name.trim().split(/\s+/)[0] || name;
  const nachricht = `Hallo ${vorname}, hier ist dein Zugang zur Stempeluhr. Öffne den Link auf deinem Handy und folge der Anleitung: ${einladung.url}`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink">
          Schick diesen Link an {vorname}. Beim Öffnen wählt {vorname} das
          Handy aus, bekommt die passende Anleitung — und ist nach der
          Installation automatisch angemeldet.
        </p>
      </div>

      <div className="rounded-lg border border-accent-line bg-accent-faint p-3">
        <p className="text-[11px] font-medium text-sub">Einrichtungs-Link</p>
        <p className="mt-1 break-all text-xs text-ink select-all">
          {einladung.url}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={kopieren}
            className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 inline-flex items-center gap-1.5"
          >
            {kopiert ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {kopiert ? "Kopiert" : "Link kopieren"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(nachricht)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg inline-flex items-center gap-1.5"
          >
            <MessageCircle className="h-4 w-4" />
            Per WhatsApp senden
          </a>
        </div>
        {kopierFehler && <p className="mt-2 text-xs text-err">{kopierFehler}</p>}
      </div>

      <details className="rounded-lg border border-line bg-bg p-3">
        <summary className="cursor-pointer text-xs text-sub">
          Lieber abscannen? QR-Code anzeigen
        </summary>
        <div className="mt-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={einladung.qr}
            alt={`QR-Code mit dem Einrichtungs-Link für ${name}`}
            className="h-44 w-44 rounded-md bg-white p-2"
          />
        </div>
      </details>

      <p className="text-xs text-sub">
        Der Link gilt bis {formatDateTime(einladung.expiresAt)} Uhr und lässt
        sich nur einmal verwenden. Sobald dieses Fenster geschlossen ist, kann er
        nicht mehr angezeigt werden — dann einfach einen neuen erzeugen.
      </p>
    </div>
  );
}
