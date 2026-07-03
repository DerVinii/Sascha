/**
 * Zugriffsschutz-Token: SHA-256 über das App-Passwort mit festem Präfix.
 * Läuft in der Edge-Middleware UND in Server-Actions — deshalb Web Crypto
 * (globalThis.crypto) statt node:crypto.
 */

export const ZUGANG_COOKIE = "sk_zugang";

export async function zugangToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`sk-zugang-v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
