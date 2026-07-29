/**
 * Katalog der Push-Benachrichtigungen. Client-sicher (keine Server-Imports):
 * Die Einstellungsseite baut daraus die Schalter, der Server prüft damit vor
 * jedem Versand, ob das Ereignis überhaupt gewünscht ist.
 *
 * Gespeichert wird in organizations.settings.pushEvents als { key: boolean }.
 * Fehlt ein Key, gilt `standard` — neue Ereignisse wirken damit sofort, ohne
 * dass jemand die Einstellungen aufmachen muss.
 */

export type PushEventKey =
  | "lead_neu"
  | "lead_antwort"
  | "lead_interessiert"
  | "lead_abgesagt"
  | "kampagne_fertig"
  | "recherche"
  | "stempeln"
  | "krankmeldung";

export type PushEventGroup = "Vertrieb" | "Team";

export type PushEventDef = {
  key: PushEventKey;
  label: string;
  hint: string;
  group: PushEventGroup;
  /** Voreinstellung, solange nichts Eigenes gespeichert ist. */
  standard: boolean;
};

export const PUSH_EVENT_GROUPS: PushEventGroup[] = ["Vertrieb", "Team"];

export const PUSH_EVENTS: PushEventDef[] = [
  {
    key: "lead_neu",
    label: "Neuer Lead",
    hint: "Ein Kontakt wird im CRM angelegt.",
    group: "Vertrieb",
    standard: true,
  },
  {
    key: "lead_antwort",
    label: "Antwort von einem Lead",
    hint: "Jemand antwortet auf eine Kampagnen-Mail.",
    group: "Vertrieb",
    standard: true,
  },
  {
    key: "lead_interessiert",
    label: "Lead ist interessiert",
    hint: "Instantly stuft eine Antwort als „Interessiert“ ein.",
    group: "Vertrieb",
    standard: true,
  },
  {
    key: "lead_abgesagt",
    label: "Lead hat abgesagt",
    hint: "Antwort wurde als „Kein Interesse“ eingestuft.",
    group: "Vertrieb",
    standard: false,
  },
  {
    key: "kampagne_fertig",
    label: "Sequenz durchgelaufen",
    hint: "Alle Mails einer Kampagne sind an einen Lead raus — ohne Antwort.",
    group: "Vertrieb",
    standard: false,
  },
  {
    key: "recherche",
    label: "Lead-Recherche fertig",
    hint: "„Update cells“ ist durch — oder wurde gestoppt, weil das KI-Kontingent aufgebraucht war.",
    group: "Vertrieb",
    standard: true,
  },
  {
    key: "stempeln",
    label: "Ein- und Ausstempeln",
    hint: "Ein Mitarbeiter stempelt sich ein oder aus. Kann bei mehreren Leuten viele Meldungen am Tag bedeuten.",
    group: "Team",
    standard: false,
  },
  {
    key: "krankmeldung",
    label: "Krankmeldung",
    hint: "Ein Mitarbeiter meldet sich über den Stempel-Bildschirm krank.",
    group: "Team",
    standard: true,
  },
];

export type PushEventPrefs = Partial<Record<PushEventKey, boolean>>;

/** Ist dieses Ereignis aktiv? Fehlender Eintrag → Voreinstellung des Katalogs. */
export function isPushEventEnabled(
  prefs: PushEventPrefs | null | undefined,
  key: PushEventKey,
): boolean {
  const gespeichert = prefs?.[key];
  if (typeof gespeichert === "boolean") return gespeichert;
  return PUSH_EVENTS.find((e) => e.key === key)?.standard ?? true;
}

/**
 * Rohwert aus organizations.settings.pushEvents in eine geprüfte Map überführen.
 * Nur bekannte Keys mit echtem Boolean überleben — so kann weder ein alter
 * Eintrag noch ein manipulierter Aufruf etwas Fremdes in die Settings schreiben.
 */
export function parsePushEventPrefs(raw: unknown): PushEventPrefs {
  if (!raw || typeof raw !== "object") return {};
  const quelle = raw as Record<string, unknown>;
  const out: PushEventPrefs = {};
  for (const def of PUSH_EVENTS) {
    const wert = quelle[def.key];
    if (typeof wert === "boolean") out[def.key] = wert;
  }
  return out;
}
