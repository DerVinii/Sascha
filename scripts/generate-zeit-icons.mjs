/**
 * Erzeugt die Symbole der Mitarbeiter-App „SK Zeit“.
 *
 *   node scripts/generate-zeit-icons.mjs
 *
 * Bewusst deutlich anders als die Symbole der Kommandozentrale (dunkles Slate,
 * Buchstaben): teal-grüner Grund mit weißer Uhr. Beide Apps liegen später
 * nebeneinander auf demselben Startbildschirm und müssen auf einen Blick
 * unterscheidbar sein.
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const GRUND = "#0f766e"; // teal-700
const HELL = "#ffffff";

/**
 * @param {number} size   Kantenlänge in Pixeln
 * @param {number} anteil Anteil der Kantenlänge, den die Uhr einnimmt.
 *                        Für maskable kleiner, damit beim Zuschneiden auf einen
 *                        Kreis (Android) nichts vom Motiv abgeschnitten wird.
 * @param {number} radius Eckenradius des Hintergrunds (0 = randfüllend)
 */
function svg(size, anteil, radius) {
  const m = size / 2;
  const r = (size * anteil) / 2;
  const strich = Math.max(2, size * 0.055);
  const zeiger = Math.max(2, size * 0.05);
  // Zeigerstellung 8:00 — die Uhrzeit, mit der auch Krank-Tage erfasst werden.
  const stundeLang = r * 0.5;
  const minuteLang = r * 0.68;
  const stundeWinkel = (8 / 12) * 2 * Math.PI; // 8 Uhr
  const sx = m + stundeLang * Math.sin(stundeWinkel);
  const sy = m - stundeLang * Math.cos(stundeWinkel);

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${GRUND}"/>
  <circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${HELL}" stroke-width="${strich}"/>
  <line x1="${m}" y1="${m}" x2="${m}" y2="${m - minuteLang}"
        stroke="${HELL}" stroke-width="${zeiger}" stroke-linecap="round"/>
  <line x1="${m}" y1="${m}" x2="${sx}" y2="${sy}"
        stroke="${HELL}" stroke-width="${zeiger}" stroke-linecap="round"/>
  <circle cx="${m}" cy="${m}" r="${zeiger * 0.9}" fill="${HELL}"/>
</svg>`);
}

const dateien = [
  // [Dateiname, Größe, Motivanteil, Eckenradius]
  ["zeit-icon-192.png", 192, 0.62, 42],
  ["zeit-icon-512.png", 512, 0.62, 112],
  // Maskable: randfüllend, Motiv klein genug für den Android-Kreiszuschnitt.
  ["zeit-icon-maskable-512.png", 512, 0.46, 0],
  // iOS schneidet die Ecken selbst zu — deshalb ebenfalls randfüllend.
  ["zeit-apple-180.png", 180, 0.6, 0],
];

for (const [name, size, anteil, radius] of dateien) {
  await sharp(svg(size, anteil, radius))
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, name));
  console.log(`  ✓ ${name} (${size}×${size})`);
}

console.log("Symbole für die App „SK Zeit“ erzeugt.");
