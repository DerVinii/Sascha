"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, FileText, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";
import {
  importContactsAction,
  type ImportContactInput,
  type ImportResult,
} from "../actions";

/** Erwartete Zielfelder und die dafür akzeptierten Spaltenüberschriften. */
const HEADER_ALIASES: Record<keyof ImportContactInput, string[]> = {
  firstName: ["vorname", "first name", "firstname", "first_name", "given name"],
  lastName: ["nachname", "last name", "lastname", "last_name", "surname", "name"],
  email: ["e-mail", "email", "mail", "e mail", "e-mail-adresse", "emailadresse"],
  phone: ["telefon", "phone", "tel", "mobil", "handy", "telefonnummer", "mobile"],
  companyName: ["firma", "firmenname", "company", "unternehmen", "company name"],
  status: ["status", "phase"],
  source: ["quelle", "source", "herkunft"],
  tags: ["tags", "tag", "schlagworte", "labels"],
};

function resolveField(header: string): keyof ImportContactInput | null {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return field as keyof ImportContactInput;
  }
  return null;
}

type Parsed = {
  rows: ImportContactInput[];
  fileName: string;
  matched: string[];
  ignored: string[];
};

export function ImportContactsModal({
  trigger,
}: {
  trigger: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setParsed(null);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean);
        if (fields.length === 0) {
          setError("Die Datei enthält keine Kopfzeile mit Spaltennamen.");
          return;
        }
        const map = new Map<string, keyof ImportContactInput>();
        const matched: string[] = [];
        const ignored: string[] = [];
        for (const f of fields) {
          const target = resolveField(f);
          if (target && !map.has(f)) {
            map.set(f, target);
            matched.push(f);
          } else {
            ignored.push(f);
          }
        }
        if (map.size === 0) {
          setError(
            "Keine bekannten Spalten gefunden. Erwartet werden u. a. Vorname, Nachname, E-Mail, Telefon, Firma.",
          );
          return;
        }
        const rows: ImportContactInput[] = [];
        for (const raw of res.data) {
          const row: ImportContactInput = {};
          for (const [header, target] of map) {
            const v = raw[header];
            if (typeof v === "string" && v.trim()) row[target] = v.trim();
          }
          if (Object.keys(row).length > 0) rows.push(row);
        }
        if (rows.length === 0) {
          setError("Die Datei enthält keine verwertbaren Zeilen.");
          return;
        }
        setParsed({ rows, fileName: file.name, matched, ignored });
      },
      error: () => setError("Die Datei konnte nicht gelesen werden."),
    });
  }

  function runImport() {
    if (!parsed) return;
    startTransition(async () => {
      const res = await importContactsAction(parsed.rows);
      setResult(res);
      router.refresh();
    });
  }

  return (
    <>
      {trigger(() => setOpen(true))}

      {open && (
        <div
          className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-lg shadow-xl max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <h3 className="text-sm font-semibold">Kontakte importieren</h3>
              <button
                onClick={close}
                className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-md text-sub hover:text-ink"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {result ? (
                <div className="space-y-3 text-center py-4">
                  <CheckCircle2 className="h-10 w-10 text-ok mx-auto" />
                  <div className="text-sm text-ink">
                    <span className="font-semibold">{result.imported}</span>{" "}
                    Kontakt{result.imported === 1 ? "" : "e"} importiert.
                  </div>
                  {result.skipped > 0 && (
                    <div className="text-xs text-sub">
                      {result.skipped} leere/ungültige Zeile
                      {result.skipped === 1 ? "" : "n"} übersprungen.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-sub">
                    Lade eine CSV-Datei hoch. Erkannt werden die Spalten{" "}
                    <span className="text-ink">Vorname</span>,{" "}
                    <span className="text-ink">Nachname</span>,{" "}
                    <span className="text-ink">E-Mail</span>,{" "}
                    <span className="text-ink">Telefon</span>,{" "}
                    <span className="text-ink">Firma</span>,{" "}
                    <span className="text-ink">Status</span>,{" "}
                    <span className="text-ink">Quelle</span> und{" "}
                    <span className="text-ink">Tags</span> — genau das Format,
                    das der Export erzeugt.
                  </p>

                  <label
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-bg px-4 py-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition"
                  >
                    <Upload className="h-6 w-6 text-sub" />
                    <span className="text-sm text-ink font-medium">
                      CSV-Datei auswählen
                    </span>
                    <span className="text-[11px] text-sub">
                      oder hierher ziehen
                    </span>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                  </label>

                  {error && <p className="text-xs text-err">{error}</p>}

                  {parsed && (
                    <div className="rounded-lg border border-line bg-bg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-ink">
                        <FileText className="h-4 w-4 text-sub shrink-0" />
                        <span className="truncate">{parsed.fileName}</span>
                      </div>
                      <div className="text-xs text-sub">
                        <span className="font-medium text-ink">
                          {parsed.rows.length}
                        </span>{" "}
                        Zeile{parsed.rows.length === 1 ? "" : "n"} bereit ·
                        Spalten:{" "}
                        <span className="text-ink">
                          {parsed.matched.join(", ")}
                        </span>
                      </div>
                      {parsed.ignored.length > 0 && (
                        <div className="text-[11px] text-sub">
                          Ignoriert: {parsed.ignored.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-line shrink-0">
              {result ? (
                <button
                  onClick={close}
                  className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition"
                >
                  Fertig
                </button>
              ) : (
                <>
                  <button
                    onClick={close}
                    className="h-9 px-4 text-sm text-sub hover:text-ink"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={runImport}
                    disabled={pending || !parsed}
                    className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
                  >
                    {pending
                      ? "Wird importiert …"
                      : parsed
                        ? `${parsed.rows.length} importieren`
                        : "Importieren"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
