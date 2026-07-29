"use server";

/**
 * Server Actions des Zeiterfassungs-Admins (/zeiterfassung).
 *
 * Alles ist org-scoped: jede Query filtert zusätzlich auf `org.id`, damit ein
 * geratener Fremd-Datensatz nie erreichbar ist.
 *
 * Jede Action prüft zuerst `requireAppZugang()`. Das Passwort-Gate der
 * Middleware bleibt der erste Riegel, ist hier aber bewusst nicht der einzige:
 * Server Actions werden über den `Next-Action`-Header ausgeführt, nicht über den
 * Pfad — ein Loch im Matcher-Regex würde sonst sämtliche Personendaten freigeben.
 * `requireActiveOrg()` hilft dagegen nicht, es liefert ohne Anmeldung immer die
 * erste Organisation und ist nur ein Datenraum-Filter.
 *
 * Fehler werden als Rückgabewert geliefert (`{ ok: false, error }`), damit die
 * Client-Komponenten sie direkt anzeigen können — geworfen wird nur bei echten
 * Programmierfehlern.
 *
 * Zeitrechnung ausschließlich über `@/lib/zeiterfassung` (Europe/Berlin) —
 * `@/lib/kalender` wäre hier falsch, weil es in Prozess-Lokalzeit rechnet.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { and, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeDevices,
  employees,
  enrollmentTokens,
  timeEditLogs,
  timeEntries,
} from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { requireAppZugang } from "@/lib/server/app-zugang";
import {
  generatePairingCode,
  hashToken,
} from "@/lib/server/zeiterfassung/tokens";
import { formatiereCode } from "@/lib/kopplungscode";
import { parseFromBerlinLocal, shiftYmd } from "@/lib/zeiterfassung";

// ============================================================================
// TYPEN
// ============================================================================

/** Einheitliches Ergebnis einer Mutation. */
export type ZeitAktion = { ok: true } | { ok: false; error: string };

/** Ein Eintrag des revisionssicheren Änderungsverlaufs (für die Historie-UI). */
export type EditLogEintrag = {
  id: string;
  fieldChanged: string;
  oldValue: Date | null;
  newValue: Date | null;
  reason: string;
  createdAt: Date;
};

// ============================================================================
// INTERNE HELFER
// ============================================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const MAX_NAME = 80;
const MIN_GRUND = 5;

function istUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Postgres-Unique-Verstoß (23505) erkennen, statt die Action crashen zu lassen. */
function istUniqueVerstoss(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

/** Name prüfen und normalisieren. */
function pruefeName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Bitte einen Namen angeben." };
  if (name.length > MAX_NAME) {
    return { ok: false, error: `Der Name darf höchstens ${MAX_NAME} Zeichen lang sein.` };
  }
  return { ok: true, name };
}

/** "YYYY-MM-DDTHH:mm[:ss]" (Berlin-lokal) → UTC-Instant, oder null. */
function parseLokal(v: string | null | undefined): Date | null {
  if (typeof v !== "string" || !LOCAL_RE.test(v)) return null;
  const mitSekunden = v.length === 16 ? `${v}:00` : v;
  const d = parseFromBerlinLocal(mitSekunden);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Vergleich auf Minutengenauigkeit — Stempelzeiten haben Sekunden, Eingaben nicht. */
function aufMinute(d: Date | null): number | null {
  return d ? Math.floor(d.getTime() / 60_000) : null;
}

/** Prüft, ob der Mitarbeiter zur aktiven Org gehört. */
async function ladeMitarbeiter(orgId: string, employeeId: string) {
  if (!istUuid(employeeId)) return null;
  const [row] = await db
    .select({
      id: employees.id,
      name: employees.name,
      active: employees.active,
    })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.id, employeeId)))
    .limit(1);
  return row ?? null;
}

/** Alle Unterseiten von /zeiterfassung neu rendern. */
function aktualisiereAnsichten() {
  revalidatePath("/zeiterfassung", "layout");
}

// ============================================================================
// MITARBEITER
// ============================================================================

/** Legt einen Mitarbeiter an. Doppelte Namen fängt der Unique-Index ab. */
export async function createEmployee(
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  const geprueft = pruefeName(name);
  if (!geprueft.ok) return geprueft;

  try {
    const [row] = await db
      .insert(employees)
      .values({ orgId: org.id, name: geprueft.name })
      .returning({ id: employees.id });
    if (!row) return { ok: false, error: "Anlegen fehlgeschlagen." };
    aktualisiereAnsichten();
    return { ok: true, id: row.id };
  } catch (e) {
    if (istUniqueVerstoss(e)) {
      return {
        ok: false,
        error: "Es gibt bereits einen Mitarbeiter mit diesem Namen.",
      };
    }
    throw e;
  }
}

/**
 * Aktiviert/deaktiviert einen Mitarbeiter.
 *
 * Beim Deaktivieren werden zusätzlich alle Geräte gesperrt — ein ausgeschiedener
 * Mitarbeiter soll mit dem gekoppelten Handy nicht weiterstempeln können.
 */
export async function setEmployeeActive(
  employeeId: string,
  active: boolean,
): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  const mitarbeiter = await ladeMitarbeiter(org.id, employeeId);
  if (!mitarbeiter) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({ active })
      .where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)));

    if (!active) {
      await tx
        .update(employeeDevices)
        .set({ revoked: true })
        .where(
          and(
            eq(employeeDevices.orgId, org.id),
            eq(employeeDevices.employeeId, employeeId),
            eq(employeeDevices.revoked, false),
          ),
        );
    }
  });

  aktualisiereAnsichten();
  return { ok: true };
}

/**
 * Löscht einen Mitarbeiter endgültig. Geräte, Einrichtungs-Codes, Zeiten und
 * deren Änderungsverlauf räumt die Datenbank per ON DELETE CASCADE mit ab.
 */
export async function deleteEmployee(
  employeeId: string,
): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  if (!istUuid(employeeId)) {
    return { ok: false, error: "Mitarbeiter nicht gefunden." };
  }

  const geloescht = await db
    .delete(employees)
    .where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)))
    .returning({ id: employees.id });

  if (geloescht.length === 0) {
    return { ok: false, error: "Mitarbeiter nicht gefunden." };
  }

  aktualisiereAnsichten();
  return { ok: true };
}

/** Benennt einen Mitarbeiter um. */
export async function renameEmployee(
  employeeId: string,
  name: string,
): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  const mitarbeiter = await ladeMitarbeiter(org.id, employeeId);
  if (!mitarbeiter) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  const geprueft = pruefeName(name);
  if (!geprueft.ok) return geprueft;

  try {
    await db
      .update(employees)
      .set({ name: geprueft.name })
      .where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)));
  } catch (e) {
    if (istUniqueVerstoss(e)) {
      return {
        ok: false,
        error: "Es gibt bereits einen Mitarbeiter mit diesem Namen.",
      };
    }
    throw e;
  }

  aktualisiereAnsichten();
  return { ok: true };
}

// ============================================================================
// GERÄTE-KOPPLUNG (QR-CODE)
// ============================================================================

/**
 * Basis-URL der App — bevorzugt aus der Env.
 *
 * Der Host-Header ist vom Aufrufer frei wählbar. Würden wir ihm blind folgen,
 * zeigte der erzeugte QR-Code auf einen fremden Server. Deshalb gilt der
 * Header-Fallback nur noch für lokale Entwicklung; sonst gibt es lieber einen
 * verständlichen Fehler als einen falschen Link.
 */
async function basisUrl(): Promise<string | null> {
  const ausEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (ausEnv) return ausEnv.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const istLokal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  return istLokal ? `http://${host}` : null;
}

/** 30 Minuten: Sascha und der Mitarbeiter richten das Handy gemeinsam ein. */
const CODE_GUELTIG_MINUTEN = 30;

/**
 * Erzeugt einen Kopplungscode zum Vorlesen plus einen QR-Code auf die
 * Installationsseite.
 *
 * Warum ein Code und kein Link mit Token: Auf dem iPhone bekommt eine zum
 * Startbildschirm hinzugefügte App einen eigenen Datenspeicher, getrennt von
 * Safari. Ein im Browser eingelöster Link würde die App also nicht koppeln —
 * das Handy müsste ein zweites Mal gekoppelt werden, und der Einmal-Code wäre
 * schon verbraucht. Deshalb wird der Code IN der installierten App eingetippt.
 *
 * Der Klartext existiert NUR in dieser Antwort — in der Datenbank liegt
 * ausschließlich sein SHA-256. Ältere, noch offene Codes desselben Mitarbeiters
 * werden entwertet, damit immer nur genau einer gültig ist.
 */
export async function createEnrollmentToken(
  employeeId: string,
  revokeExisting: boolean,
): Promise<
  | { ok: true; code: string; url: string; qr: string; expiresAt: string }
  | { ok: false; error: string }
> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  const mitarbeiter = await ladeMitarbeiter(org.id, employeeId);
  if (!mitarbeiter) return { ok: false, error: "Mitarbeiter nicht gefunden." };
  if (!mitarbeiter.active) {
    return {
      ok: false,
      error: "Der Mitarbeiter ist deaktiviert und kann kein Gerät koppeln.",
    };
  }

  // Vor dem Schreiben klären: ohne verlässliche App-Adresse gäbe es hinterher
  // nur einen unsicheren Link — dann lieber gar keinen Code verbrauchen.
  const basis = await basisUrl();
  if (!basis) {
    return {
      ok: false,
      error: "Die App-Adresse ist nicht konfiguriert. Bitte NEXT_PUBLIC_APP_URL setzen.",
    };
  }

  const code = generatePairingCode();
  const tokenLookup = hashToken(code);
  const expiresAt = new Date(Date.now() + CODE_GUELTIG_MINUTEN * 60 * 1000);

  await db.transaction(async (tx) => {
    if (revokeExisting) {
      // Bestehende Handys sperren — das neu gekoppelte ersetzt sie.
      await tx
        .update(employeeDevices)
        .set({ revoked: true })
        .where(
          and(
            eq(employeeDevices.orgId, org.id),
            eq(employeeDevices.employeeId, employeeId),
            eq(employeeDevices.revoked, false),
          ),
        );
    }

    // Es soll immer nur genau ein offener Code gültig sein.
    await tx
      .update(enrollmentTokens)
      .set({ consumed: true, consumedAt: new Date() })
      .where(
        and(
          eq(enrollmentTokens.orgId, org.id),
          eq(enrollmentTokens.employeeId, employeeId),
          eq(enrollmentTokens.consumed, false),
        ),
      );

    await tx.insert(enrollmentTokens).values({
      orgId: org.id,
      employeeId,
      tokenLookup,
      expiresAt,
    });
  });

  // Der QR enthält bewusst KEIN Geheimnis mehr, sondern nur die
  // Installationsseite. Er ist eine Abkürzung zum Tippen der Adresse, kein
  // Ausweis — dadurch steht der Code auch nicht in Server-Logs oder im Verlauf.
  const url = `${basis}/zeit`;
  const qr = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  aktualisiereAnsichten();
  return {
    ok: true,
    code: formatiereCode(code),
    url,
    qr,
    expiresAt: expiresAt.toISOString(),
  };
}

/** Sperrt ein gekoppeltes Gerät (z. B. Handy verloren). */
export async function revokeDevice(deviceId: string): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  if (!istUuid(deviceId)) return { ok: false, error: "Gerät nicht gefunden." };

  const rows = await db
    .update(employeeDevices)
    .set({ revoked: true })
    .where(
      and(eq(employeeDevices.orgId, org.id), eq(employeeDevices.id, deviceId)),
    )
    .returning({ id: employeeDevices.id });

  if (rows.length === 0) return { ok: false, error: "Gerät nicht gefunden." };

  aktualisiereAnsichten();
  return { ok: true };
}

// ============================================================================
// ZEITEINTRÄGE
// ============================================================================

/**
 * Legt einen Zeiteintrag von Hand an (z. B. wenn jemand vergessen hat zu
 * stempeln). Immer mit Begründung — der Eintrag gilt sofort als bearbeitet.
 *
 * Nachtschicht: liegt das Ende zeitlich vor oder auf dem Beginn, zählt es zum
 * Folgetag.
 */
export async function addTimeEntry(input: {
  employeeId: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:mm */
  beginn: string;
  /** HH:mm oder null = Eintrag läuft noch */
  ende: string | null;
  grund: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAppZugang();
  const org = await requireActiveOrg();

  const grund = (input.grund ?? "").trim();
  if (grund.length < MIN_GRUND) {
    return {
      ok: false,
      error: `Bitte eine Begründung angeben (mind. ${MIN_GRUND} Zeichen).`,
    };
  }
  if (!YMD_RE.test(input.datum ?? "")) {
    return { ok: false, error: "Bitte einen gültigen Tag auswählen." };
  }
  if (!HHMM_RE.test(input.beginn ?? "")) {
    return { ok: false, error: "Bitte einen gültigen Beginn angeben." };
  }
  if (input.ende !== null && !HHMM_RE.test(input.ende ?? "")) {
    return { ok: false, error: "Bitte ein gültiges Ende angeben." };
  }

  const mitarbeiter = await ladeMitarbeiter(org.id, input.employeeId);
  if (!mitarbeiter) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  const clockIn = parseLokal(`${input.datum}T${input.beginn}:00`);
  if (!clockIn) return { ok: false, error: "Bitte einen gültigen Beginn angeben." };

  let clockOut: Date | null = null;
  if (input.ende) {
    // Gleicher Zeitpunkt wäre über die Nachtschicht-Regel ein stiller
    // 24-Stunden-Eintrag — fast immer ein Tippfehler, also lieber nachfragen.
    if (input.ende === input.beginn) {
      return { ok: false, error: "Beginn und Ende dürfen nicht identisch sein." };
    }
    // Nachtschicht: Ende < Beginn ⇒ Ende liegt am Folgetag.
    const endeDatum =
      input.ende < input.beginn ? shiftYmd(input.datum, 1) : input.datum;
    clockOut = parseLokal(`${endeDatum}T${input.ende}:00`);
    if (!clockOut) return { ok: false, error: "Bitte ein gültiges Ende angeben." };
  } else {
    // Ohne Ende wäre der Eintrag "läuft gerade" — davon darf es nur einen geben.
    const [offen] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, org.id),
          eq(timeEntries.employeeId, input.employeeId),
          isNull(timeEntries.clockOut),
        ),
      )
      .limit(1);
    if (offen) {
      return {
        ok: false,
        error:
          "Für diesen Mitarbeiter läuft bereits ein Eintrag. Bitte zuerst ein Ende eintragen.",
      };
    }
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [erstellt] = await tx
        .insert(timeEntries)
        .values({
          orgId: org.id,
          employeeId: input.employeeId,
          clockIn,
          clockOut,
          wasEdited: true,
        })
        .returning({ id: timeEntries.id });

      await tx.insert(timeEditLogs).values({
        orgId: org.id,
        timeEntryId: erstellt.id,
        employeeId: input.employeeId,
        fieldChanged: "created",
        oldValue: null,
        newValue: clockIn,
        entryClockIn: clockIn,
        entryClockOut: clockOut,
        reason: grund,
      });

      if (clockOut) {
        await tx.insert(timeEditLogs).values({
          orgId: org.id,
          timeEntryId: erstellt.id,
          employeeId: input.employeeId,
          fieldChanged: "clockOut",
          oldValue: null,
          newValue: clockOut,
          entryClockIn: clockIn,
          entryClockOut: clockOut,
          reason: grund,
        });
      }

      return erstellt.id;
    });

    aktualisiereAnsichten();
    return { ok: true, id };
  } catch (e) {
    if (istUniqueVerstoss(e)) {
      // Einziger Unique-Index auf time_entries: max. ein laufender Eintrag.
      return {
        ok: false,
        error:
          "Für diesen Mitarbeiter läuft bereits ein Eintrag. Bitte zuerst ein Ende eintragen.",
      };
    }
    throw e;
  }
}

/**
 * Korrigiert einen Zeiteintrag.
 *
 * Verglichen wird minutengenau — die Original-Stempelzeit hat Sekunden, das
 * Eingabefeld nicht. Ohne diese Rundung würde jedes Speichern eine Änderung an
 * einer unveränderten Zeit protokollieren. Es werden nur die tatsächlich
 * geänderten Felder geschrieben und je Feld eine Log-Zeile angelegt.
 */
export async function updateTimeEntry(input: {
  entryId: string;
  /** YYYY-MM-DDTHH:mm (datetime-local, Berlin) */
  beginn: string;
  /** YYYY-MM-DDTHH:mm oder null = Eintrag läuft noch */
  ende: string | null;
  grundBeginn: string;
  grundEnde: string;
}): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  if (!istUuid(input.entryId)) {
    return { ok: false, error: "Eintrag nicht gefunden." };
  }

  const neuerBeginn = parseLokal(input.beginn);
  if (!neuerBeginn) return { ok: false, error: "Bitte einen gültigen Beginn angeben." };

  let neuesEnde: Date | null = null;
  if (input.ende !== null && input.ende !== "") {
    neuesEnde = parseLokal(input.ende);
    if (!neuesEnde) return { ok: false, error: "Bitte ein gültiges Ende angeben." };
  }
  if (neuesEnde && neuesEnde.getTime() <= neuerBeginn.getTime()) {
    return { ok: false, error: "Das Ende muss nach dem Beginn liegen." };
  }

  const [vorhanden] = await db
    .select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
    })
    .from(timeEntries)
    .where(
      and(eq(timeEntries.orgId, org.id), eq(timeEntries.id, input.entryId)),
    )
    .limit(1);
  if (!vorhanden) return { ok: false, error: "Eintrag nicht gefunden." };

  const beginnGeaendert =
    aufMinute(vorhanden.clockIn) !== aufMinute(neuerBeginn);
  const endeGeaendert = aufMinute(vorhanden.clockOut) !== aufMinute(neuesEnde);

  if (!beginnGeaendert && !endeGeaendert) {
    return { ok: false, error: "Es wurde nichts geändert." };
  }

  const grundBeginn = (input.grundBeginn ?? "").trim();
  const grundEnde = (input.grundEnde ?? "").trim();
  if (beginnGeaendert && grundBeginn.length < MIN_GRUND) {
    return {
      ok: false,
      error: `Bitte eine Begründung für den Beginn angeben (mind. ${MIN_GRUND} Zeichen).`,
    };
  }
  if (endeGeaendert && grundEnde.length < MIN_GRUND) {
    return {
      ok: false,
      error: `Bitte eine Begründung für das Ende angeben (mind. ${MIN_GRUND} Zeichen).`,
    };
  }

  // Ein Eintrag wieder zu "läuft gerade" machen geht nur, wenn kein anderer läuft.
  if (!neuesEnde && vorhanden.clockOut) {
    const [offen] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, org.id),
          eq(timeEntries.employeeId, vorhanden.employeeId),
          isNull(timeEntries.clockOut),
          ne(timeEntries.id, vorhanden.id),
        ),
      )
      .limit(1);
    if (offen) {
      return {
        ok: false,
        error:
          "Für diesen Mitarbeiter läuft bereits ein anderer Eintrag. Bitte zuerst ein Ende eintragen.",
      };
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Nur geänderte Felder schreiben — so bleibt die Sekunden-Genauigkeit des
      // unveränderten Feldes erhalten.
      const werte: {
        clockIn?: Date;
        clockOut?: Date | null;
        wasEdited: boolean;
      } = { wasEdited: true };
      if (beginnGeaendert) werte.clockIn = neuerBeginn;
      if (endeGeaendert) werte.clockOut = neuesEnde;

      await tx
        .update(timeEntries)
        .set(werte)
        .where(
          and(eq(timeEntries.orgId, org.id), eq(timeEntries.id, vorhanden.id)),
        );

      // Eckwerte nach der Korrektur — damit die Protokollzeile den Eintrag auch
      // dann noch benennt, wenn er später gelöscht wird.
      const eckBeginn = beginnGeaendert ? neuerBeginn : vorhanden.clockIn;
      const eckEnde = endeGeaendert ? neuesEnde : vorhanden.clockOut;

      if (beginnGeaendert) {
        await tx.insert(timeEditLogs).values({
          orgId: org.id,
          timeEntryId: vorhanden.id,
          employeeId: vorhanden.employeeId,
          fieldChanged: "clockIn",
          oldValue: vorhanden.clockIn,
          newValue: neuerBeginn,
          entryClockIn: eckBeginn,
          entryClockOut: eckEnde,
          reason: grundBeginn,
        });
      }
      if (endeGeaendert) {
        await tx.insert(timeEditLogs).values({
          orgId: org.id,
          timeEntryId: vorhanden.id,
          employeeId: vorhanden.employeeId,
          fieldChanged: "clockOut",
          oldValue: vorhanden.clockOut,
          newValue: neuesEnde,
          entryClockIn: eckBeginn,
          entryClockOut: eckEnde,
          reason: grundEnde,
        });
      }
    });
  } catch (e) {
    if (istUniqueVerstoss(e)) {
      return {
        ok: false,
        error:
          "Für diesen Mitarbeiter läuft bereits ein anderer Eintrag. Bitte zuerst ein Ende eintragen.",
      };
    }
    throw e;
  }

  aktualisiereAnsichten();
  return { ok: true };
}

/**
 * Löscht einen Zeiteintrag endgültig — aber nur mit Begründung und nur mit
 * Protokollzeile.
 *
 * Die Zeile wird VOR dem Löschen in derselben Transaktion geschrieben und hält
 * die Eckwerte des Eintrags als Kopie fest. `time_entry_id` steht auf ON DELETE
 * SET NULL, die Zeile überlebt das Löschen also und wird nur vom Eintrag
 * abgehängt. Ohne das wäre eine Löschung der einfachste Weg, eine korrigierte
 * Zeit spurlos verschwinden zu lassen.
 */
export async function deleteTimeEntry(
  entryId: string,
  grund: string,
): Promise<ZeitAktion> {
  await requireAppZugang();
  const org = await requireActiveOrg();
  if (!istUuid(entryId)) return { ok: false, error: "Eintrag nicht gefunden." };

  const begruendung = (grund ?? "").trim();
  if (begruendung.length < MIN_GRUND) {
    return {
      ok: false,
      error: `Bitte eine Begründung mit mindestens ${MIN_GRUND} Zeichen angeben.`,
    };
  }

  const [vorhanden] = await db
    .select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.orgId, org.id), eq(timeEntries.id, entryId)))
    .limit(1);
  if (!vorhanden) return { ok: false, error: "Eintrag nicht gefunden." };

  const geloescht = await db.transaction(async (tx) => {
    await tx.insert(timeEditLogs).values({
      orgId: org.id,
      timeEntryId: vorhanden.id,
      employeeId: vorhanden.employeeId,
      fieldChanged: "deleted",
      oldValue: vorhanden.clockIn,
      newValue: null,
      entryClockIn: vorhanden.clockIn,
      entryClockOut: vorhanden.clockOut,
      reason: begruendung,
    });

    const weg = await tx
      .delete(timeEntries)
      .where(and(eq(timeEntries.orgId, org.id), eq(timeEntries.id, entryId)))
      .returning({ id: timeEntries.id });
    return weg.length;
  });

  if (geloescht === 0) {
    return { ok: false, error: "Eintrag nicht gefunden." };
  }

  aktualisiereAnsichten();
  return { ok: true };
}
