import { createHash, randomBytes, randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LAENGE } from "@/lib/kopplungscode";

/**
 * Token-Helfer für Geräte-Kopplung und Enrollment.
 *
 * Der Klartext-Token wird nie gespeichert — in der Datenbank liegt nur sein
 * SHA-256 (`token_lookup`). Wer die DB liest, kann daraus kein gültiges Gerät
 * bauen.
 *
 * Nur serverseitig verwendbar (node:crypto läuft nicht in der Edge-Middleware).
 */

/** 32 zufällige Bytes als Hex-String. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 eines Tokens als Hex — der in der DB gespeicherte Lookup-Wert. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Kopplungscode, den Sascha dem Mitarbeiter vorliest und der in der App
 * eingetippt wird (Format siehe @/lib/kopplungscode).
 *
 * `randomInt` statt einer Modulo-Rechnung auf Zufallsbytes: 31 teilt 256 nicht
 * glatt, eine Modulo-Auswahl würde die ersten Zeichen des Alphabets bevorzugen.
 */
export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LAENGE; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}
