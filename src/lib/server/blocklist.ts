/**
 * Sperrliste — Menschen, die nie wieder eine Kampagnen-Mail bekommen dürfen
 * (Widerspruch, „bitte nicht mehr anschreiben", verbrannter Kontakt).
 *
 * Gesperrt wird über die E-Mail-Adresse UND/ODER den Namen. Der Name ist wichtig,
 * weil derselbe Mensch nach einem erneuten Scrape unter einer anderen Adresse
 * auftauchen kann (mal die persönliche, mal die info@-Adresse der Firma).
 *
 * Der Filter greift beim Versand an Instantly, nicht beim Scrapen: Ein gesperrter
 * Lead darf in der Tabelle stehen bleiben (sonst wundert man sich, warum die Firma
 * fehlt) — er bekommt nur keine Mail.
 */

import { db } from "@/db";
import { blockedLeads } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  addBlocklistEntry,
  removeBlocklistEntry,
} from "@/lib/server/instantly/client";

export type BlockedLead = {
  id: string;
  email: string | null;
  name: string | null;
  note: string | null;
  /** true = die Adresse steht auch in Instantlys eigener Sperrliste. */
  instantlySynced: boolean;
  createdAt: string;
};

/** E-Mail für den Vergleich vereinheitlichen. Ohne "@" wertlos → null. */
export function normalizeBlockEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}

/**
 * Namen vergleichbar machen: klein, ohne akademische Titel und Satzzeichen,
 * einfache Leerzeichen. "Dr. Matthias Maier" und "matthias  maier" sind damit
 * derselbe Eintrag. Bewusst KEINE unscharfe Suche — "Maier" und "Mayer" sind
 * verschiedene Menschen, und eine Sperre darf niemanden zufällig mitnehmen.
 */
export function normalizeBlockName(raw: string | null | undefined): string | null {
  const v = (raw ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    // Titel und Grade, die vor dem Namen stehen können.
    .replace(/\b(dr|prof|dipl|ing|mag|med|rer|nat|phil|habil|h\s*c|mba|msc|bsc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return v.length > 1 ? v : null;
}

/**
 * Vorbereiteter Prüfer für einen ganzen Versand-Lauf: einmal laden, dann pro
 * Zeile in O(1) prüfen (der Versand geht über hunderte Leads).
 */
export type Blocklist = {
  /** Anzahl Einträge — 0 = Sperrliste leer, Aufrufer kann sich die Prüfung sparen. */
  size: number;
  /** true = dieser Lead darf NICHT angeschrieben werden. */
  isBlocked: (input: {
    emails?: (string | null | undefined)[];
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  }) => boolean;
};

const LEER: Blocklist = { size: 0, isBlocked: () => false };

export async function loadBlocklist(orgId: string): Promise<Blocklist> {
  const rows = await db
    .select({ email: blockedLeads.email, name: blockedLeads.name })
    .from(blockedLeads)
    .where(eq(blockedLeads.orgId, orgId));

  if (rows.length === 0) return LEER;

  const mails = new Set<string>();
  const namen = new Set<string>();
  for (const r of rows) {
    const e = normalizeBlockEmail(r.email);
    if (e) mails.add(e);
    const n = normalizeBlockName(r.name);
    if (n) namen.add(n);
  }

  return {
    size: rows.length,
    isBlocked: ({ emails = [], firstName, lastName, name }) => {
      // Jede bekannte Adresse prüfen, nicht nur die, an die gerade gesendet
      // würde: Ist die Entscheider-Mail gesperrt, ist auch die normale tabu.
      for (const raw of emails) {
        const e = normalizeBlockEmail(raw);
        if (e && mails.has(e)) return true;
      }
      if (namen.size > 0) {
        const voll = normalizeBlockName(
          name ?? [firstName, lastName].filter(Boolean).join(" "),
        );
        if (voll && namen.has(voll)) return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Verwaltung (Einstellungen → Sperrliste)
// ---------------------------------------------------------------------------

export async function listBlockedLeads(orgId: string): Promise<BlockedLead[]> {
  const rows = await db
    .select()
    .from(blockedLeads)
    .where(eq(blockedLeads.orgId, orgId))
    .orderBy(asc(blockedLeads.name), asc(blockedLeads.email));
  return rows.map(zuBlockedLead);
}

function zuBlockedLead(r: typeof blockedLeads.$inferSelect): BlockedLead {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    note: r.note,
    instantlySynced: r.instantlySyncedAt !== null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Adresse zusätzlich in Instantlys eigene Sperrliste eintragen.
 *
 * Warum überhaupt doppelt: Der App-Filter greift beim Einspielen neuer Leads.
 * Instantlys Sperrliste wirkt workspace-weit und zusätzlich auf alles, was dort
 * schon liegt oder von Hand angelegt wird — also auch auf laufende Kampagnen.
 * Zwei unabhängige Schlösser für denselben Wunsch: nie wieder anschreiben.
 *
 * Best-Effort und bewusst ohne Weiterwerfen: Ist Instantly gerade nicht
 * erreichbar, darf die Sperre trotzdem NICHT verloren gehen — lokal ist sie
 * gespeichert, und der fehlende Haken bleibt in der Oberfläche sichtbar.
 */
async function inInstantlySperren(email: string | null): Promise<Date | null> {
  if (!email) return null; // Nur-Name-Eintrag: Instantly kennt nur Adressen/Domains
  try {
    await addBlocklistEntry(email);
    return new Date();
  } catch (err) {
    console.error("Instantly-Sperrliste: Eintragen fehlgeschlagen", err);
    return null;
  }
}

/**
 * Eintrag anlegen. Existiert die Adresse schon, werden Name/Notiz nur ergänzt —
 * ein zweites Eintragen derselben Person soll nichts überschreiben und nicht
 * mit einem Fehler abbrechen.
 */
export async function addBlockedLead(
  orgId: string,
  input: { email?: string | null; name?: string | null; note?: string | null },
): Promise<{ entry: BlockedLead | null; error: string | null }> {
  const email = normalizeBlockEmail(input.email);
  const nameRoh = (input.name ?? "").trim();
  const name = normalizeBlockName(nameRoh) ? nameRoh.replace(/\s+/g, " ") : null;
  const note = (input.note ?? "").trim().slice(0, 300) || null;

  if (!email && !name) {
    return { entry: null, error: "Bitte eine E-Mail-Adresse oder einen Namen angeben." };
  }

  const vorhanden = await db
    .select()
    .from(blockedLeads)
    .where(eq(blockedLeads.orgId, orgId));

  const treffer = vorhanden.find(
    (r) =>
      (email && normalizeBlockEmail(r.email) === email) ||
      (name && normalizeBlockName(r.name) === normalizeBlockName(name)),
  );

  const [row] = treffer
    ? await db
        .update(blockedLeads)
        .set({
          email: treffer.email ?? email,
          name: treffer.name ?? name,
          note: treffer.note ?? note,
        })
        .where(and(eq(blockedLeads.id, treffer.id), eq(blockedLeads.orgId, orgId)))
        .returning()
    : await db
        .insert(blockedLeads)
        .values({ orgId, email, name, note })
        .returning();

  // Zusätzlich in Instantly sperren. Schon übertragene Einträge werden nicht
  // erneut geschickt, ein bisher fehlgeschlagener Versuch aber wiederholt.
  let gesendet = row.instantlySyncedAt;
  if (!gesendet) {
    gesendet = await inInstantlySperren(row.email);
    if (gesendet) {
      await db
        .update(blockedLeads)
        .set({ instantlySyncedAt: gesendet })
        .where(and(eq(blockedLeads.id, row.id), eq(blockedLeads.orgId, orgId)));
    }
  }

  return {
    entry: zuBlockedLead({ ...row, instantlySyncedAt: gesendet }),
    error: null,
  };
}

/**
 * Sperre aufheben — auch in Instantly, sonst bliebe die Person dort weiter
 * blockiert, obwohl sie in der App wieder freigegeben ist.
 */
export async function removeBlockedLead(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(blockedLeads)
    .where(and(eq(blockedLeads.id, id), eq(blockedLeads.orgId, orgId)))
    .limit(1);

  await db
    .delete(blockedLeads)
    .where(and(eq(blockedLeads.id, id), eq(blockedLeads.orgId, orgId)));

  if (row?.email) {
    try {
      await removeBlocklistEntry(row.email);
    } catch (err) {
      // Wie beim Eintragen: Der lokale Zustand hat Vorrang, ein Instantly-
      // Ausfall darf das Freigeben nicht scheitern lassen.
      console.error("Instantly-Sperrliste: Entfernen fehlgeschlagen", err);
    }
  }
}
