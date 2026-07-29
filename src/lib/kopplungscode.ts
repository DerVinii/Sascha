/**
 * Format des Kopplungscodes, mit dem ein Handy an einen Mitarbeiter gebunden wird.
 *
 * Der Code wird vorgelesen oder abgetippt, deshalb enthält das Alphabet keine
 * verwechselbaren Zeichen: kein 0/O, kein 1/I/L. Wer trotzdem ein „O“ tippt,
 * bekommt schlicht einen ungültigen Code — falsch raten kann man sich nicht.
 *
 * 31 Zeichen an 8 Stellen ergeben rund 8·10¹¹ Möglichkeiten. Zusammen mit der
 * kurzen Gültigkeit (30 Minuten) und genau einem gültigen Code pro Mitarbeiter
 * ist Durchprobieren aussichtslos.
 *
 * Frei von Server-Imports — die Eingabemaske nutzt dieselben Funktionen.
 */

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LAENGE = 8;

/**
 * Bringt eine Eingabe auf die Form, in der der Code gehasht wird:
 * Großbuchstaben, alles Fremde (Leerzeichen, Bindestriche, Tippfehler-Zeichen)
 * entfällt. „k7m2 9xpd“ und „K7M2-9XPD“ ergeben denselben Wert.
 */
export function normalisiereCode(eingabe: string): string {
  const gross = (eingabe ?? "").toUpperCase();
  let raus = "";
  for (const zeichen of gross) {
    if (CODE_ALPHABET.includes(zeichen)) raus += zeichen;
  }
  return raus.slice(0, CODE_LAENGE);
}

/** Anzeigeform mit Bindestrich in der Mitte: „K7M29XPD“ → „K7M2-9XPD“. */
export function formatiereCode(code: string): string {
  const rein = normalisiereCode(code);
  if (rein.length <= 4) return rein;
  return `${rein.slice(0, 4)}-${rein.slice(4)}`;
}

/** Ist die Eingabe vollständig? */
export function istVollstaendig(eingabe: string): boolean {
  return normalisiereCode(eingabe).length === CODE_LAENGE;
}
