/**
 * Prüft die Versandkette für Signaturen mit Bild:
 *   Editor-HTML (Data-URI) → sanitize → CID-Anhänge → fertiges MIME.
 *
 * Kern der Prüfung ist, dass das Bild beim Empfänger ankommt: als inline
 * referenzierter Teil eines multipart/related, nicht als Data-URI (die
 * blockieren Outlook/Gmail) und nicht als loser Dateianhang.
 *
 * Aufruf: npx tsx scripts/test-signature-mail.ts
 */
import nodemailer from "nodemailer";
import { inlineDataImages } from "../src/lib/server/mailbox/inline-images";
import {
  htmlToPlainText,
  sanitizeEmailHtml,
  wrapMailDocument,
} from "../src/lib/signature";

// 1×1-PNG (rot) als Data-URI — steht stellvertretend für das Firmenlogo.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const signatureHtml =
  `<div data-sk-signature="abc">` +
  `<div><span style="font-family:Calibri, 'Segoe UI', sans-serif;font-size:11pt">` +
  `<b>Sascha Kühn</b><br>Dozent und Coach<br>` +
  `<a href="mailto:info@sk-dozentundcoach.de">info@sk-dozentundcoach.de</a></span></div>` +
  `<div><img src="data:image/png;base64,${PNG_BASE64}" alt="Logo" width="240" height="80" style="width:240px;height:80px;" /></div>` +
  `</div>`;

const composed =
  `<div>Hallo Herr Muster,<br><br>anbei die Unterlagen.</div>` +
  signatureHtml +
  `<div data-sk-quote="1">Ursprüngliche Nachricht …</div>`;

// --- Pipeline wie in sendMailAction ----------------------------------------
const clean = sanitizeEmailHtml(composed);
const text = htmlToPlainText(clean);
const { html: htmlWithCids, attachments } = inlineDataImages(clean);

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

console.log("\n1) Umwandlung Data-URI → CID");
check("genau ein Inline-Anhang erzeugt", attachments.length === 1, `${attachments.length}`);
check("kein data:-Bild mehr im HTML", !/src\s*=\s*["']data:/i.test(htmlWithCids));
check("HTML referenziert cid:", /src="cid:sig-[^"]+"/.test(htmlWithCids));
check(
  "Anhang ist inline mit CID",
  attachments[0]?.contentDisposition === "inline" && Boolean(attachments[0]?.cid),
);
check("Content-Type des Anhangs stimmt", attachments[0]?.contentType === "image/png");
check(
  "Bilddaten unverändert übernommen",
  attachments[0]?.content.toString("base64") === PNG_BASE64,
);
check(
  "CID im HTML == CID des Anhangs",
  htmlWithCids.includes(`cid:${attachments[0]?.cid}`),
);
check(
  "Breite/Höhe bleiben als Attribut erhalten (Outlook)",
  /width="240"/.test(htmlWithCids) && /height="80"/.test(htmlWithCids),
);

console.log("\n2) Text-Variante (multipart/alternative)");
check("Name aus der Signatur enthalten", text.includes("Sascha Kühn"));
check("kein HTML-Rest", !/[<>]/.test(text.replace(/[<>]/g, "")) && !text.includes("<div"));
check("keine Base64-Reste", !text.includes("iVBOR"));

console.log("\n2b) HTML-Säuberung: Gefährliches raus, Signatur-HTML bleibt");
const dirty =
  `<div data-sk-signature="x" style="color:#111">` +
  `<b>Name</b><span style="font-size:11pt;font-family:Arial">Zeile</span>` +
  `<a href="https://sk-dozentundcoach.de">Web</a>` +
  `<img src="data:image/png;base64,AAAA" width="120" height="40" style="width:120px" alt="Logo">` +
  `<table><tr><td>Zelle</td></tr></table>` +
  `<ul><li>Punkt</li></ul>` +
  `<script>alert(1)</script><iframe src="https://boese.example"></iframe>` +
  `<img src="x" onerror=alert(2)><a href="javascript:alert(3)">klick</a>` +
  `</div>`;
const cleaned = sanitizeEmailHtml(dirty);

check("<script> entfernt", !/<script/i.test(cleaned));
check("<iframe> entfernt", !/<iframe/i.test(cleaned));
check("onerror-Handler entfernt", !/onerror/i.test(cleaned));
check("javascript:-Link entschärft", !/javascript:/i.test(cleaned));
check("Signatur-Marker bleibt", /data-sk-signature="x"/.test(cleaned));
check("Inline-Styles bleiben", /font-size:11pt/.test(cleaned));
check("Fettung bleibt", /<b>Name<\/b>/.test(cleaned));
check("normaler Link bleibt", /href="https:\/\/sk-dozentundcoach\.de"/.test(cleaned));
check("Bild inkl. Maßen bleibt", /<img[^>]+width="120"[^>]+height="40"/.test(cleaned));
check("Tabelle bleibt (Signatur-Layout)", /<table>.*<td>Zelle<\/td>/.test(cleaned));
check("Liste bleibt", /<li>Punkt<\/li>/.test(cleaned));

async function checkMime() {
  console.log("\n3) Fertiges MIME");
  const built = await nodemailer
    .createTransport({ streamTransport: true, buffer: true, newline: "crlf" })
    .sendMail({
      from: "info@sk-dozentundcoach.de",
      to: "empfaenger@beispiel.de",
      subject: "Test",
      text,
      html: wrapMailDocument(htmlWithCids),
      attachments,
    });
  const raw = (built as unknown as { message: Buffer }).message.toString("utf8");

  check("multipart/related (eingebettetes Bild)", /multipart\/related/i.test(raw));
  check("multipart/alternative (Text + HTML)", /multipart\/alternative/i.test(raw));
  check("Content-ID-Kopfzeile gesetzt", /Content-ID:\s*<sig-[^>]+>/i.test(raw));
  check("Content-Disposition: inline", /Content-Disposition:\s*inline/i.test(raw));
  check(
    "Bild NICHT als normaler Anhang",
    !/Content-Disposition:\s*attachment;\s*filename="bild-1\.png"/i.test(raw),
  );
  check(
    "Bilddaten im MIME enthalten",
    raw.replace(/\r?\n/g, "").includes(PNG_BASE64.slice(0, 40)),
  );

  console.log(`\nMIME-Größe: ${(raw.length / 1024).toFixed(1)} kB`);

  // 4) Die gesendete Mail wieder einlesen — so landet sie im Ordner
  //    „Gesendet" und wird von unserem Lesebereich angezeigt.
  console.log("\n4) Rücklesen aus dem Ordner Gesendet");
  const { simpleParser } = await import("mailparser");
  const { embedRelatedImages } = await import(
    "../src/lib/server/mailbox/imap"
  );
  const parsed = await simpleParser((built as unknown as { message: Buffer }).message);

  check("Bild als Inline-Teil erkannt", parsed.attachments?.[0]?.related === true);
  check(
    "wird nicht als Dateianhang gelistet",
    (parsed.attachments ?? []).filter(
      (a) => (a.contentDisposition ?? "").toLowerCase() === "attachment",
    ).length === 0,
  );

  const readable = embedRelatedImages(parsed.html || "", parsed.attachments ?? []);
  check("cid: im Lese-HTML aufgelöst", !/cid:/i.test(readable));
  check("Bild als Data-URI eingesetzt", /src="data:image\/png;base64,/.test(readable));
  check("Bilddaten identisch zum Original", readable.includes(PNG_BASE64));

  console.log(
    failures.length === 0
      ? "\nAlle Prüfungen bestanden.\n"
      : `\nFEHLGESCHLAGEN (${failures.length}): ${failures.join(", ")}\n`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

void checkMime();
