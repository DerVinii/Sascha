"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { addManualLeadAction } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  listId: string;
  onAdded: () => void;
};

export function ManualLeadModal({ open, onClose, listId, onAdded }: Props) {
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [firma, setFirma] = useState("");
  const [webseite, setWebseite] = useState("");
  const [telefon, setTelefon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function submit() {
    setError(null);
    const mail = email.trim();
    if (mail && !mail.includes("@")) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    const anyFilled = [vorname, nachname, mail, firma, webseite, telefon].some(
      (v) => v.trim(),
    );
    if (!anyFilled) {
      setError("Bitte mindestens ein Feld ausfüllen.");
      return;
    }
    startTransition(async () => {
      try {
        await addManualLeadAction({
          listId,
          firma,
          webseite,
          telefon,
          vorname,
          nachname,
          email: mail,
        });
        setVorname("");
        setNachname("");
        setEmail("");
        setFirma("");
        setWebseite("");
        setTelefon("");
        onAdded();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(15,23,42,0.45)",
        // Sicherheitsabstand zu Notch und Home-Indikator (viewport-fit=cover);
        // auf Desktop sind die Insets 0 → bleibt bei den 1rem aus p-4.
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* max-h-full + flex-col: auf dem Handy scrollt das Formular, die Knöpfe
          unten bleiben erreichbar. */}
      <div className="w-full max-w-md max-h-full flex flex-col rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">Lead manuell hinzufügen</h3>
          {/* p-3/-m-3: 40px Fingerfläche, ohne das Layout zu verändern. */}
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="shrink-0 p-3 -m-3 text-sub hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-sub">Vorname</span>
              <input
                autoFocus
                value={vorname}
                onChange={(e) => setVorname(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-sub">Nachname</span>
              <input
                value={nachname}
                onChange={(e) => setNachname(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-sub">E-Mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@firma.de"
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sub">Firma</span>
            <input
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sub">Webseite</span>
            <input
              value={webseite}
              onChange={(e) => setWebseite(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sub">Telefon</span>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
            />
          </label>
          {error && <p className="text-sm text-err">{error}</p>}
          <p className="text-[11px] text-sub">
            Alle Felder sind optional — fülle einfach aus, was du hast. Leere
            Felder (z. B. Name/E-Mail) kannst du später auch per „Entscheider
            finden" automatisch ergänzen.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-sub hover:text-ink">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "…" : "Hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}
