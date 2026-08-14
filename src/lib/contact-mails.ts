/**
 * Geteilte Typen für den E-Mail-Verlauf eines Kontakts — sichtbar im
 * Kontakt-Panel und auf der vollständigen Kontaktseite.
 *
 * Zusammengeführt werden zwei Quellen:
 *  • „Postfach"  — das echte Postfach (IMAP, live durchsucht nach der Adresse)
 *  • „Kampagne"  — Instantly-Kampagnenmails aus dem DB-Spiegel
 *
 * Keine Server-Imports — wird von Client-Komponenten mitgeladen.
 */

export type ContactMailSource = "postfach" | "kampagne";

export type ContactMailItem = {
  /** Stabiler React-Schlüssel (Quelle + Herkunft). */
  id: string;
  source: ContactMailSource;
  /** „in" = vom Kontakt an uns, „out" = von uns an den Kontakt. */
  direction: "in" | "out";
  subject: string | null;
  /** Kurzvorschau ohne HTML (leer, wenn erst beim Aufklappen geladen wird). */
  preview: string | null;
  date: string; // ISO
  /** Gegenüber: Absender bei Eingang, Empfänger bei Ausgang. */
  counterpart: string | null;
  /** Nur Postfach: IMAP-Pfad + UID, um den Text nachzuladen. */
  folder: string | null;
  uid: number | null;
  /** Nur Postfach: deutscher Ordnername („Posteingang", „Gesendet", …). */
  folderLabel: string | null;
  /** Nur Kampagne: Instantly-Mail-ID, um den Text nachzuladen. */
  campaignMailId: string | null;
  /** Nur Kampagne: Name der Instantly-Kampagne. */
  campaignName: string | null;
  hasAttachments: boolean;
};

export type ContactMailHistory = {
  items: ContactMailItem[];
  /** Adressen, nach denen gesucht wurde (E-Mail + Entscheider-E-Mail). */
  addresses: string[];
  /**
   * Postfach nicht verbunden oder nicht erreichbar. Die Kampagnenmails stehen
   * in diesem Fall trotzdem in `items` — der Verlauf ist dann nur unvollständig.
   */
  postfachError: string | null;
};

/** Nachgeladener Nachrichtentext (erst beim Aufklappen eines Eintrags). */
export type ContactMailBody = {
  html: string | null;
  text: string | null;
};

/** Eingabe für das Nachladen eines Nachrichtentexts. */
export type ContactMailBodyRef =
  | { source: "postfach"; folder: string; uid: number }
  | { source: "kampagne"; id: string };
