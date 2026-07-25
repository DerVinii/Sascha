/**
 * Geteilte Typen + Helfer für E-Mail-Signaturen und HTML-Mails.
 *
 * Diese Datei enthält KEINE Server-Imports und darf daher sowohl aus
 * Client-Komponenten (Editor, Composer) als auch aus Server-Actions
 * importiert werden.
 */

export type EmailSignature = {
  id: string;
  name: string;
  /** Fertiger HTML-Block; Bilder stecken als Data-URI drin. */
  html: string;
};

/**
 * Markiert den Signatur-Block im Composer. Dadurch kann ein Signaturwechsel
 * den alten Block ersetzen statt einen zweiten anzuhängen — genau wie Outlook.
 */
export const SIGNATURE_ATTR = "data-sk-signature";

/** Markiert den zitierten Originaltext einer Antwort/Weiterleitung. */
export const QUOTE_ATTR = "data-sk-quote";

/**
 * Schriftbild der ausgehenden Mails — bewusst Outlook-nah (Calibri 11pt),
 * damit Signaturen beim Empfänger so aussehen wie im Editor.
 */
export const MAIL_FONT =
  "Calibri, 'Segoe UI', -apple-system, Helvetica, Arial, sans-serif";
export const MAIL_FONT_SIZE = "11pt";

/** Obergrenze pro eingefügtem Bild (Data-URI inkl. Base64-Overhead, ~2 MB). */
export const MAX_IMAGE_BYTES = 2_000_000;

// --- HTML-Säuberung ---------------------------------------------------------

/**
 * Entfernt alles, was in einer E-Mail nichts zu suchen hat: Skripte, externe
 * Einbettungen, Event-Handler und `javascript:`-URLs. Bewusst regexbasiert und
 * konservativ — die Signaturen kommen aus dem eigenen Editor, die Prüfung ist
 * ein Sicherheitsnetz gegen eingefügten Fremd-HTML (Copy/Paste aus dem Web).
 */
export function sanitizeEmailHtml(html: string): string {
  return (
    html
      // Ganze Blöcke inklusive Inhalt.
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      // Verbleibende Einzel-Tags (auch unpaarig geschriebene).
      .replace(
        /<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|svg|math)\b[^>]*>/gi,
        "",
      )
      // Event-Handler in allen drei Schreibweisen.
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
      // javascript:-Ziele entschärfen.
      .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
  );
}

/** Text → HTML (escaped, Zeilenumbrüche als <br>). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text: string): string {
  return `<div>${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

// --- HTML → Plaintext -------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#0?39);/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => {
      const code = Number(d);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    // &amp; zuletzt, sonst würde &amp;lt; doppelt dekodiert.
    .replace(/&amp;/gi, "&");
}

/**
 * Erzeugt die Text-Variante (multipart/alternative) aus dem HTML-Body.
 * Bilder fallen weg — dafür gibt es den HTML-Teil.
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n• ")
    .replace(/<\s*\/\s*(p|div|li|tr|ul|ol|h[1-6]|blockquote|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ist der Editor-Inhalt leer (nur Umbrüche/Leerzeichen)? */
export function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  if (/<img\b/i.test(html)) return false;
  return htmlToPlainText(html).length === 0;
}

// --- Versand-Dokument -------------------------------------------------------

/**
 * Verpackt den Body in ein vollständiges HTML-Dokument mit fester Grundschrift.
 * Ohne diesen Rahmen rendern manche Clients (u. a. Outlook) mit ihrer eigenen
 * Default-Schrift — die Signatur sähe dann anders aus als im Editor.
 */
export function wrapMailDocument(bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "</head>",
    `<body style="margin:0;padding:0;font-family:${MAIL_FONT};font-size:${MAIL_FONT_SIZE};color:#111827;">`,
    bodyHtml,
    "</body></html>",
  ].join("");
}
