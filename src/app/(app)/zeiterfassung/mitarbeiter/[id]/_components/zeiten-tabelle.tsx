"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  durationMinutes,
  isoForBerlinInput,
} from "@/lib/zeiterfassung";
import { deleteTimeEntry, updateTimeEntry } from "../../../actions";

export type VerlaufEintrag = {
  id: string;
  fieldChanged: string;
  /** ISO-String */
  oldValue: string | null;
  /** ISO-String */
  newValue: string | null;
  reason: string;
  /** ISO-String */
  createdAt: string;
};

export type ZeitEintrag = {
  id: string;
  /** ISO-String */
  clockIn: string;
  /** ISO-String, null = läuft noch */
  clockOut: string | null;
  sick: boolean;
  wasEdited: boolean;
  verlauf: VerlaufEintrag[];
};

/** Feldnamen des Änderungsverlaufs auf Deutsch. */
const FELD_LABEL: Record<string, string> = {
  created: "Angelegt",
  clockIn: "Beginn",
  clockOut: "Ende",
  deleted: "Gelöscht",
};

function feldLabel(feld: string): string {
  return FELD_LABEL[feld] ?? feld;
}

function zeitOderStrich(iso: string | null): string {
  return iso ? formatDateTime(iso) : "—";
}

/**
 * Ab dieser Laufzeit ist ein noch offener Eintrag mit hoher Wahrscheinlichkeit
 * ein vergessenes Ausstempeln und wird gekennzeichnet.
 */
const LANGE_LAUFZEIT_MINUTEN = 16 * 60;

export function ZeitenTabelle({
  eintraege,
  jetzt,
}: {
  eintraege: ZeitEintrag[];
  /** ISO-String: Renderzeitpunkt des Servers (stabil für laufende Einträge) */
  jetzt: string;
}) {
  const router = useRouter();
  const [bearbeiten, setBearbeiten] = useState<ZeitEintrag | null>(null);
  const [loeschen, setLoeschen] = useState<ZeitEintrag | null>(null);
  const [verlauf, setVerlauf] = useState<ZeitEintrag | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [beginn, setBeginn] = useState("");
  const [ende, setEnde] = useState("");
  const [grundBeginn, setGrundBeginn] = useState("");
  const [grundEnde, setGrundEnde] = useState("");
  const [grundLoeschen, setGrundLoeschen] = useState("");

  const jetztDatum = useMemo(() => new Date(jetzt), [jetzt]);

  /**
   * Dauer je Zeile: Beginn → Ende (bzw. jetzt).
   *
   * Die Monatstabelle ist eine Abrechnungsansicht: ein Eintrag gehört
   * vollständig in den Monat, in dem er begonnen hat. Würde die Summe wie in den
   * Kacheln auf das Monatsfenster geklemmt, zeigte eine Nachtschicht über den
   * Monatswechsel in der Zeile 8:00 h und in der Fußzeile 2:00 h.
   */
  const zeilen = useMemo(
    () =>
      eintraege.map((e) => ({
        eintrag: e,
        minuten: durationMinutes(e.clockIn, e.clockOut ?? jetztDatum),
      })),
    [eintraege, jetztDatum],
  );

  const summe = useMemo(
    () => zeilen.reduce((s, z) => s + z.minuten, 0),
    [zeilen],
  );

  const dialogOffen = Boolean(bearbeiten || loeschen || verlauf);
  useEffect(() => {
    if (!dialogOffen) return;
    function beiTaste(e: KeyboardEvent) {
      // Während des Speicherns nicht schließen — sonst geht eine Fehlermeldung
      // der laufenden Action verloren.
      if (e.key !== "Escape" || pending) return;
      setBearbeiten(null);
      setLoeschen(null);
      setVerlauf(null);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [dialogOffen, pending]);

  function bearbeitenOeffnen(e: ZeitEintrag) {
    setFehler(null);
    setBearbeiten(e);
    setBeginn(isoForBerlinInput(new Date(e.clockIn)));
    setEnde(e.clockOut ? isoForBerlinInput(new Date(e.clockOut)) : "");
    setGrundBeginn("");
    setGrundEnde("");
  }

  // Nur tatsächlich geänderte Felder brauchen eine Begründung.
  const beginnGeaendert = bearbeiten
    ? beginn !== isoForBerlinInput(new Date(bearbeiten.clockIn))
    : false;
  const endeGeaendert = bearbeiten
    ? ende !==
      (bearbeiten.clockOut ? isoForBerlinInput(new Date(bearbeiten.clockOut)) : "")
    : false;

  function speichern() {
    if (!bearbeiten) return;
    setFehler(null);
    if (!beginnGeaendert && !endeGeaendert) {
      setFehler("Es wurde nichts geändert.");
      return;
    }
    if (beginnGeaendert && grundBeginn.trim().length < 5) {
      setFehler("Bitte eine Begründung für den Beginn angeben (mind. 5 Zeichen).");
      return;
    }
    if (endeGeaendert && grundEnde.trim().length < 5) {
      setFehler("Bitte eine Begründung für das Ende angeben (mind. 5 Zeichen).");
      return;
    }
    const entryId = bearbeiten.id;
    startTransition(async () => {
      try {
        const res = await updateTimeEntry({
          entryId,
          beginn,
          ende: ende ? ende : null,
          grundBeginn: grundBeginn.trim(),
          grundEnde: grundEnde.trim(),
        });
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setBearbeiten(null);
        router.refresh();
      } catch {
        setFehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  function loeschenBestaetigen() {
    if (!loeschen) return;
    setFehler(null);
    if (grundLoeschen.trim().length < 5) {
      setFehler("Bitte eine Begründung mit mindestens 5 Zeichen angeben.");
      return;
    }
    const entryId = loeschen.id;
    const grund = grundLoeschen.trim();
    startTransition(async () => {
      try {
        const res = await deleteTimeEntry(entryId, grund);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setLoeschen(null);
        router.refresh();
      } catch {
        setFehler("Löschen fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  const feldKlasse =
    "w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
  const textFeldKlasse =
    "w-full px-2 py-1.5 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

  return (
    <>
      {eintraege.length === 0 ? (
        <p className="text-sm text-sub">
          In diesem Monat wurden keine Zeiten erfasst.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-sub font-medium text-left">
                <th className="py-1 pr-3 font-medium">Datum</th>
                <th className="py-1 pr-3 font-medium">Beginn</th>
                <th className="py-1 pr-3 font-medium">Ende</th>
                <th className="py-1 pr-3 font-medium text-right">Dauer</th>
                <th className="py-1 font-medium text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ eintrag: e, minuten }) => {
                const laeuft = e.clockOut === null;
                const ungewoehnlichLang =
                  laeuft && minuten > LANGE_LAUFZEIT_MINUTEN;
                return (
                  <tr key={e.id} className="border-t border-line">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink">
                      <span className="inline-flex items-center gap-2">
                        {formatDate(e.clockIn)}
                        {e.sick && (
                          <span className="pill bg-warn/10 text-warn">Krank</span>
                        )}
                      </span>
                      {e.wasEdited && (
                        <button
                          type="button"
                          onClick={() => setVerlauf(e)}
                          title="Änderungsverlauf anzeigen"
                          className="ml-2 text-xs text-sub underline hover:text-ink"
                        >
                          bearbeitet
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-ink">
                      {formatDateTime(e.clockIn, "HH:mm")}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {laeuft ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className="text-ok">läuft</span>
                          {ungewoehnlichLang && (
                            <span className="pill bg-warn/10 text-warn">
                              läuft ungewöhnlich lange
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink">
                          {formatDateTime(e.clockOut as string, "HH:mm")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-right text-ink">
                      {formatDuration(minuten)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => bearbeitenOeffnen(e)}
                        className="text-xs text-ink hover:underline inline-flex items-center gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFehler(null);
                          setGrundLoeschen("");
                          setLoeschen(e);
                        }}
                        className="ml-3 text-xs text-err hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td colSpan={3} className="py-2 text-xs text-sub">
                  Summe im Monat
                </td>
                <td className="py-2 pr-3 text-right text-sm font-semibold text-ink tabular-nums">
                  {formatDuration(summe)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {fehler && !bearbeiten && !loeschen && (
        <p className="text-xs text-err">{fehler}</p>
      )}

      {/* Bearbeiten */}
      {bearbeiten && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget && !pending) setBearbeiten(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Zeit korrigieren</h2>
              <button
                type="button"
                onClick={() => setBearbeiten(null)}
                disabled={pending}
                aria-label="Schließen"
                className="text-sub hover:text-ink disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-sub">
              Jede Korrektur wird mit Begründung protokolliert. Eine Begründung
              ist nur für das Feld nötig, das du tatsächlich änderst.
            </p>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-sub">
                Beginn
              </label>
              <input
                type="datetime-local"
                value={beginn}
                onChange={(ev) => setBeginn(ev.target.value)}
                className={feldKlasse}
              />
              <label className="block text-[11px] font-medium text-sub">
                Begründung Beginn{beginnGeaendert ? " (nötig)" : ""}
              </label>
              <textarea
                rows={2}
                value={grundBeginn}
                onChange={(ev) => setGrundBeginn(ev.target.value)}
                disabled={!beginnGeaendert}
                placeholder={
                  beginnGeaendert
                    ? "z. B. Stempeln vergessen, Beginn laut Notiz 07:30"
                    : "Nur nötig, wenn du den Beginn änderst."
                }
                className={`${textFeldKlasse} disabled:opacity-50`}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-sub">
                Ende (leer = läuft noch)
              </label>
              <input
                type="datetime-local"
                value={ende}
                onChange={(ev) => setEnde(ev.target.value)}
                className={feldKlasse}
              />
              <label className="block text-[11px] font-medium text-sub">
                Begründung Ende{endeGeaendert ? " (nötig)" : ""}
              </label>
              <textarea
                rows={2}
                value={grundEnde}
                onChange={(ev) => setGrundEnde(ev.target.value)}
                disabled={!endeGeaendert}
                placeholder={
                  endeGeaendert
                    ? "z. B. Ausstempeln vergessen, Feierabend war 16:00"
                    : "Nur nötig, wenn du das Ende änderst."
                }
                className={`${textFeldKlasse} disabled:opacity-50`}
              />
            </div>

            {fehler && <p className="text-xs text-err">{fehler}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBearbeiten(null)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={speichern}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Speichern …" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Änderungsverlauf */}
      {verlauf && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setVerlauf(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Änderungsverlauf
                </h2>
                <p className="text-xs text-sub">{formatDate(verlauf.clockIn)}</p>
              </div>
              <button
                type="button"
                onClick={() => setVerlauf(null)}
                disabled={pending}
                aria-label="Schließen"
                className="text-sub hover:text-ink disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {verlauf.verlauf.length === 0 ? (
              <p className="text-sm text-sub">Keine Einträge vorhanden.</p>
            ) : (
              <ol className="space-y-3">
                {verlauf.verlauf.map((l) => (
                  <li
                    key={l.id}
                    className="border-l-2 border-accent-line pl-3 space-y-0.5"
                  >
                    <p className="text-[11px] text-sub">
                      {formatDateTime(l.createdAt)} Uhr · {feldLabel(l.fieldChanged)}
                    </p>
                    <p className="text-sm text-ink">
                      {zeitOderStrich(l.oldValue)} →{" "}
                      <span className="font-medium">
                        {zeitOderStrich(l.newValue)}
                      </span>
                    </p>
                    <p className="text-xs text-sub italic">„{l.reason}“</p>
                  </li>
                ))}
              </ol>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setVerlauf(null)}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Löschen */}
      {loeschen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget && !pending) setLoeschen(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3">
            <h2 className="text-sm font-semibold text-ink">Eintrag löschen?</h2>
            <p className="text-sm text-ink">
              {formatDate(loeschen.clockIn)} ·{" "}
              {formatDateTime(loeschen.clockIn, "HH:mm")} –{" "}
              {loeschen.clockOut
                ? formatDateTime(loeschen.clockOut, "HH:mm")
                : "läuft"}
            </p>
            <p className="text-xs text-sub">
              Der Eintrag wird unwiderruflich gelöscht. Die Löschung bleibt mit
              Zeitpunkt, Eckdaten und Begründung im Änderungsprotokoll vermerkt.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-sub">
                Begründung (nötig)
              </label>
              <textarea
                rows={2}
                value={grundLoeschen}
                onChange={(ev) => setGrundLoeschen(ev.target.value)}
                placeholder="z. B. Doppelt erfasst, Mitarbeiter war an dem Tag nicht da"
                className={textFeldKlasse}
              />
            </div>

            {fehler && <p className="text-xs text-err">{fehler}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLoeschen(null)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={loeschenBestaetigen}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Wird gelöscht …" : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
