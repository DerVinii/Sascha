/**
 * Provider-Dispatch für Enrichment-Spalten — der Waterfall-Stub.
 *
 * Clays Signature-Feature ist die "Waterfall": mehrere Provider werden
 * nacheinander probiert, bis einer einen Treffer liefert. Aktuell ist nur
 * "gemini" angebunden; die Schleife ist aber schon mehrprovider-fähig, sodass
 * ein zweiter Provider (Apollo, Hunter, …) später ohne Umbau dazukommt.
 */

import { enrichLead, type EnrichmentResult } from "./enrich";

export type ProviderInputs = {
  firmenname: string;
  webseite?: string | null;
  gmapsUrl?: string | null;
  /** Adresse des Standorts (Google-Maps-Zeile) — nur im Rollen-Modus genutzt. */
  adresse?: string | null;
  /** Zielrolle des Ordners; leer/null = Geschäftsführung (Standard). */
  zielrolle?: string | null;
};

export type ProviderRun = {
  provider: string | null; // Provider, der den Treffer lieferte (null = keiner)
  result: EnrichmentResult;
};

const NOT_FOUND: EnrichmentResult = {
  vorname: "NF",
  nachname: "NF",
  email: "NF",
  found: false,
};

async function runSingle(
  provider: string,
  inputs: ProviderInputs,
): Promise<EnrichmentResult> {
  switch (provider) {
    case "gemini":
      return enrichLead(inputs);
    default:
      throw new Error(`Unbekannter Provider: ${provider}`);
  }
}

/**
 * Probiert die Provider-Kette der Reihe nach; stoppt beim ersten Treffer.
 * Liefert keiner einen Treffer, kommt das letzte (NF-)Ergebnis zurück.
 */
export async function runProvider(
  providers: string[],
  inputs: ProviderInputs,
): Promise<ProviderRun> {
  const chain = providers.length > 0 ? providers : ["gemini"];
  let last: EnrichmentResult = NOT_FOUND;

  for (const provider of chain) {
    const result = await runSingle(provider, inputs);
    if (result.found) return { provider, result };
    last = result;
  }

  return { provider: null, result: last };
}
