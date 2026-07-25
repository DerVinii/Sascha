/**
 * Wandelt eingebettete Data-URI-Bilder (`src="data:image/png;base64,…"`) in
 * echte CID-Anhänge um.
 *
 * Warum: Data-URIs im HTML werden von den meisten Mail-Clients blockiert oder
 * gar nicht erst gerendert (Outlook, Gmail-Web, Apple Mail teils). Ein Bild in
 * der Signatur wäre beim Empfänger dann nur ein leerer Platzhalter. Ein
 * `cid:`-Verweis auf einen inline-Anhang ist dagegen der Standardweg für
 * eingebettete Bilder (multipart/related) und wird überall angezeigt.
 *
 * Nur serverseitig importieren.
 */

import { randomUUID } from "node:crypto";
import type { OutgoingAttachment } from "./smtp";

/** `src="data:image/<subtype>;base64,<daten>"` — mit " oder ' als Begrenzer. */
const DATA_IMAGE_RE =
  /src\s*=\s*(["'])data:image\/([a-z0-9.+-]+)\s*;\s*base64\s*,\s*([a-z0-9+/=\s]+?)\1/gi;

/** MIME-Subtyp → Dateiendung, wo beides auseinanderläuft. */
const EXTENSION: Record<string, string> = {
  jpeg: "jpg",
  "svg+xml": "svg",
  "x-icon": "ico",
};

export function inlineDataImages(html: string): {
  html: string;
  attachments: OutgoingAttachment[];
} {
  const attachments: OutgoingAttachment[] = [];

  const out = html.replace(DATA_IMAGE_RE, (match, quote, subtype, base64) => {
    const content = Buffer.from(String(base64).replace(/\s+/g, ""), "base64");
    // Kaputtes/leeres Bild lieber unverändert lassen als einen leeren Anhang
    // zu erzeugen.
    if (content.length === 0) return match;

    const sub = String(subtype).toLowerCase();
    const cid = `sig-${randomUUID()}@sk-zentrale`;
    attachments.push({
      filename: `bild-${attachments.length + 1}.${EXTENSION[sub] ?? sub}`,
      content,
      contentType: `image/${sub}`,
      cid,
      contentDisposition: "inline",
    });
    return `src=${quote}cid:${cid}${quote}`;
  });

  return { html: out, attachments };
}
