"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CODE_LAENGE,
  formatiereCode,
  istVollstaendig,
  normalisiereCode,
} from "@/lib/kopplungscode";
import { mitCodeKoppeln } from "../koppeln-actions";

/**
 * Code-Eingabe für ein noch nicht gekoppeltes Gerät.
 *
 * Die Eingabe ist bewusst nachsichtig: Kleinbuchstaben, Leerzeichen und
 * Bindestriche werden beim Tippen weggeräumt, der Bindestrich in der Mitte
 * kommt automatisch. Wer den Code vorgelesen bekommt, soll ihn nicht in einer
 * bestimmten Schreibweise treffen müssen.
 */
export function KoppelnFormular() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const bereit = istVollstaendig(code);

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !bereit) return;
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await mitCodeKoppeln(code);
        if (!ergebnis.ok) {
          setFehler(ergebnis.error);
          return;
        }
        // Die Seite rendert danach die Stempeluhr statt dieses Formulars.
        router.refresh();
      } catch {
        setFehler("Das hat nicht geklappt. Bitte noch einmal versuchen.");
      }
    });
  }

  return (
    <form onSubmit={absenden} className="space-y-3">
      <label
        htmlFor="kopplungscode"
        className="block text-xs font-medium text-sub"
      >
        Kopplungscode
      </label>
      <input
        id="kopplungscode"
        name="kopplungscode"
        value={formatiereCode(code)}
        onChange={(e) => {
          setCode(normalisiereCode(e.target.value));
          setFehler(null);
        }}
        placeholder="XXXX-XXXX"
        // Tastatur ohne Autokorrektur: sonst „verbessert“ das Handy den Code.
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="one-time-code"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        disabled={pending}
        aria-describedby={fehler ? "kopplungsfehler" : undefined}
        className="w-full h-14 px-3 border border-line rounded-md bg-bg text-center text-2xl font-semibold tracking-[0.2em] text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
      />

      <button
        type="submit"
        disabled={pending || !bereit}
        className="w-full h-11 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Wird gekoppelt …" : "Gerät koppeln"}
      </button>

      {fehler && (
        <p id="kopplungsfehler" className="text-sm text-err">
          {fehler}
        </p>
      )}

      <p className="text-xs text-sub">
        Der Code besteht aus {CODE_LAENGE} Zeichen und ist 30 Minuten gültig.
        Groß- und Kleinschreibung spielt keine Rolle.
      </p>
    </form>
  );
}
