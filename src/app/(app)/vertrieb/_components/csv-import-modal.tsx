"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { X, Upload, FileText } from "lucide-react";
import {
  importLeadsAction,
  type ImportRow,
  type ImportResult,
} from "../actions";

const COLUMN_HINTS = [
  "firstName / Vorname",
  "lastName / Nachname",
  "email / E-Mail",
  "phone / Telefon",
  "companyName / Firma",
  "source / Quelle",
];

function pickColumn(
  row: Record<string, string>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase() === lowerKey && v?.trim()) return v.trim();
    }
  }
  return null;
}

function mapRow(row: Record<string, string>): ImportRow {
  return {
    firstName: pickColumn(row, ["firstName", "Vorname", "first_name"]),
    lastName: pickColumn(row, ["lastName", "Nachname", "last_name"]),
    email: pickColumn(row, ["email", "E-Mail", "EMail", "e_mail"]),
    phone: pickColumn(row, ["phone", "Telefon", "phone_number"]),
    companyName: pickColumn(row, [
      "companyName",
      "Firma",
      "company",
      "company_name",
    ]),
    source: pickColumn(row, ["source", "Quelle"]),
  };
}

export function CsvImportModal() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const mapped = parsed.data
          .map(mapRow)
          .filter((r) => r.email || r.firstName || r.lastName || r.companyName);
        setRows(mapped);
      },
    });
  }

  function close() {
    setOpen(false);
    setRows([]);
    setFileName(null);
    setResult(null);
  }

  function doImport() {
    startTransition(async () => {
      const r = await importLeadsAction(rows);
      setResult(r);
      setRows([]);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition shrink-0"
      >
        <Upload className="h-4 w-4" />
        CSV importieren
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="text-sm font-semibold">Leads aus CSV importieren</h3>
              <button onClick={close} className="text-sub hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {!fileName && !result && (
                <div className="space-y-4">
                  <label className="block border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-sub transition">
                    <Upload className="h-8 w-8 text-sub mx-auto mb-2" />
                    <p className="text-sm font-medium text-ink">
                      CSV-Datei wählen
                    </p>
                    <p className="text-xs text-sub mt-1">
                      oder hier hineinziehen
                    </p>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                  </label>

                  <div className="bg-bg rounded-md p-3">
                    <p className="text-xs font-medium text-ink mb-1.5">
                      Unterstützte Spaltennamen (erste Zeile = Header):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {COLUMN_HINTS.map((c) => (
                        <span
                          key={c}
                          className="text-[11px] px-2 py-0.5 rounded bg-surface text-sub"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-sub mt-2">
                      Duplikate werden anhand der E-Mail-Adresse erkannt und
                      übersprungen.
                    </p>
                  </div>
                </div>
              )}

              {fileName && rows.length > 0 && !result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-sub" />
                    <span className="font-medium">{fileName}</span>
                    <span className="text-sub">— {rows.length} Zeilen</span>
                  </div>

                  <div className="border border-line rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-bg text-left text-sub">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Vorname</th>
                          <th className="px-2 py-1.5 font-medium">Nachname</th>
                          <th className="px-2 py-1.5 font-medium">E-Mail</th>
                          <th className="px-2 py-1.5 font-medium">Firma</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5">
                              {r.firstName ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              {r.lastName ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 truncate max-w-[200px]">
                              {r.email ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 truncate max-w-[150px]">
                              {r.companyName ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 5 && (
                      <p className="text-[11px] text-sub p-2 bg-bg border-t border-line">
                        + {rows.length - 5} weitere Zeilen
                      </p>
                    )}
                  </div>
                </div>
              )}

              {result && (
                <div className="text-center py-6 space-y-3">
                  <div className="text-2xl font-semibold text-ok">
                    {result.imported} importiert
                  </div>
                  {result.duplicates > 0 && (
                    <p className="text-sm text-sub">
                      {result.duplicates} Duplikat
                      {result.duplicates !== 1 ? "e" : ""} übersprungen
                    </p>
                  )}
                  {result.errors.length > 0 && (
                    <div className="text-xs text-err">
                      Fehler:{" "}
                      <ul className="mt-1">
                        {result.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
              <button
                onClick={close}
                className="h-9 px-4 text-sm text-sub hover:text-ink"
              >
                {result ? "Schließen" : "Abbrechen"}
              </button>
              {rows.length > 0 && !result && (
                <button
                  onClick={doImport}
                  disabled={pending}
                  className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {pending
                    ? "Wird importiert …"
                    : `${rows.length} Leads importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
