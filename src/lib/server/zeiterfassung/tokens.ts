import { createHash, randomBytes } from "node:crypto";

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
