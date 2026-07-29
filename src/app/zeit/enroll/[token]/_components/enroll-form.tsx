"use client";

import { useState, useTransition } from "react";
import { geraetEinrichten } from "../actions";

/**
 * Bei Erfolg leitet die Server Action per `redirect()` auf /zeit/stempel um.
 * Next signalisiert das über eine geworfene Kontroll-Exception mit einem
 * `digest`, der mit "NEXT_REDIRECT" beginnt — die darf hier NICHT als Fehler
 * angezeigt, sondern muss weitergereicht werden.
 */
function istRedirect(fehler: unknown): boolean {
  if (typeof fehler !== "object" || fehler === null) return false;
  const digest = (fehler as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Schickt den Einrichtungs-Code ab. Erfolg = Weiterleitung auf /zeit/stempel
 * (der redirect passiert in der Server Action), Fehler kommen als Text zurück.
 */
export function EnrollForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    startTransition(async () => {
      try {
        const res = await geraetEinrichten(token, name);
        // Bei Erfolg leitet die Action weiter — hier kommt dann nichts an.
        if (res && !res.ok) setFehler(res.error);
      } catch (fehler) {
        // Abgebrochene Verbindung (Baustelle, schlechter Empfang) oder
        // Serverfehler: ohne diese Meldung sprang der Button nur wortlos
        // zurück auf „Gerät einrichten“.
        if (istRedirect(fehler)) throw fehler;
        setFehler("Das hat nicht geklappt. Bitte noch einmal versuchen.");
      }
    });
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="geraetename"
          className="block text-[11px] font-medium text-sub"
        >
          Gerätename (optional)
        </label>
        <input
          id="geraetename"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Handy von Anna"
          autoComplete="off"
          className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <p className="text-xs text-sub">
          Hilft nur bei der Zuordnung in der Geräteliste.
        </p>
      </div>

      {fehler ? (
        <p className="text-sm text-err" role="alert">
          {fehler}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={laeuft}
        className="w-full h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
      >
        {laeuft ? "Wird eingerichtet …" : "Gerät einrichten"}
      </button>
    </form>
  );
}
