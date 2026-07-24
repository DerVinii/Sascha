/**
 * Anwendungsseitige Verschlüsselung der Google-Tokens (AES-256-GCM).
 *
 * Der Schlüssel kommt aus GOOGLE_TOKEN_SECRET (beliebige Zeichenkette, per
 * SHA-256 auf 32 Byte normalisiert). Ist die Variable nicht gesetzt, werden
 * Tokens im Klartext gespeichert (Übergang) — Supabase verschlüsselt die DB
 * ohnehin at rest. Für Produktion GOOGLE_TOKEN_SECRET setzen.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const secret = process.env.GOOGLE_TOKEN_SECRET?.trim();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string): string {
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptToken(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // Klartext (Übergang)
  const k = key();
  if (!k) throw new Error("GOOGLE_TOKEN_SECRET fehlt zum Entschlüsseln der Tokens.");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
