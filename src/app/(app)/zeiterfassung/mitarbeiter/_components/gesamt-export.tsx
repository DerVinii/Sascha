"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Monatswahl + Download-Link für den CSV-Export ALLER Mitarbeiter.
 * Der Download läuft über eine Route (kein Server Action), weil Server Actions
 * keine Dateien ausliefern können.
 */
export function GesamtExport({ standardMonat }: { standardMonat: string }) {
  const [monat, setMonat] = useState(standardMonat);

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Monatsexport</h2>
      <p className="text-xs text-sub mt-1">
        Alle Zeiten aller Mitarbeiter des gewählten Monats als CSV (Semikolon,
        Excel-tauglich).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={monat}
          onChange={(e) => setMonat(e.target.value)}
          aria-label="Monat für den CSV-Export"
          className="h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        {monat ? (
          <a
            href={`/api/zeiterfassung/export?monat=${monat}`}
            download
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg"
          >
            <Download className="h-4 w-4" />
            CSV herunterladen
          </a>
        ) : (
          <span className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border border-line bg-surface text-sub opacity-50">
            <Download className="h-4 w-4" />
            CSV herunterladen
          </span>
        )}
      </div>
    </div>
  );
}
