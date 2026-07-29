"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { timeEditLogs, timeEntries } from "@/db/schema";
import { requireDeviceEmployee } from "@/lib/server/zeiterfassung/auth";
import { isPushConfigured, sendPushToOrg } from "@/lib/server/push";
import {
  dayKeyBerlin,
  parseFromBerlinLocal,
  shiftYmd,
} from "@/lib/zeiterfassung";

/**
 * Server Actions für den Mitarbeiter-Stempelbildschirm.
 *
 * Die Identität kommt ausschließlich aus dem Geräte-Cookie
 * (`requireDeviceEmployee`), nicht aus dem APP_PASSWORD-Gate — /zeit/* ist
 * davon bewusst ausgenommen. `employee.orgId` ist dort bereits gegen die
 * aktive Organisation geprüft und dient hier als Org-Scope für jede Query.
 */

// Ein Krank-Tag zählt als voller Arbeitstag von 08:00–16:00 (8 Stunden).
const KRANK_START = "08:00:00";
const KRANK_ENDE = "16:00:00";

// Obergrenze, damit ein Tippfehler nicht Monate an Einträgen erzeugt.
const MAX_TAGE = 62;

// Plausibilitätsfenster: Ohne diese Grenzen könnte sich jemand selbst
// 8-Stunden-Tage in bereits abgerechnete Vormonate oder weit in die Zukunft
// buchen. Ältere Zeiträume korrigiert Sascha im Admin-Bereich.
const MAX_TAGE_RUECKWIRKEND = 14;
const MAX_TAGE_VORAUS = 30;

// Grund, der im Änderungsprotokoll steht (Selbst-Krankmeldung vs. Admin-Eintrag).
const KRANK_GRUND = "Selbst-Krankmeldung";

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

export type StempelErgebnis =
  | { ok: true; richtung: "ein" | "aus"; zeitpunkt: string }
  | { ok: false; error: string };

export type KrankErgebnis =
  | { ok: true; angelegt: number; uebersprungen: number }
  | { ok: false; error: string };

/** Alle betroffenen Seiten auffrischen — inkl. Saschas Admin-Ressort. */
function alleAnsichtenAuffrischen() {
  revalidatePath("/zeit/stempel");
  revalidatePath("/zeit/meine-zeiten");
  revalidatePath("/zeiterfassung", "layout");
}

/**
 * Verstoß gegen den partiellen Unique-Index `time_entries_open_unique`.
 * Passiert im Alltag durch zwei schnelle Taps auf denselben Button.
 */
function istDoppeltesEinstempeln(fehler: unknown): boolean {
  if (typeof fehler !== "object" || fehler === null) return false;
  return (fehler as { code?: unknown }).code === "23505";
}

// ============================================================================
// EIN- / AUSSTEMPELN
// ============================================================================

export async function stempeln(
  richtung: "ein" | "aus",
): Promise<StempelErgebnis> {
  const { employee } = await requireDeviceEmployee();
  const jetzt = new Date();

  if (richtung === "ein") {
    const laufend = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, employee.orgId),
          eq(timeEntries.employeeId, employee.id),
          isNull(timeEntries.clockOut),
        ),
      )
      .limit(1);

    if (laufend.length > 0) {
      return { ok: false, error: "Du bist bereits eingestempelt." };
    }

    try {
      await db.insert(timeEntries).values({
        orgId: employee.orgId,
        employeeId: employee.id,
        clockIn: jetzt,
      });
    } catch (fehler) {
      if (istDoppeltesEinstempeln(fehler)) {
        return { ok: false, error: "Du bist bereits eingestempelt." };
      }
      throw fehler;
    }
  } else {
    const [offen] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, employee.orgId),
          eq(timeEntries.employeeId, employee.id),
          isNull(timeEntries.clockOut),
        ),
      )
      .orderBy(desc(timeEntries.clockIn))
      .limit(1);

    if (!offen) {
      return { ok: false, error: "Du bist gerade nicht eingestempelt." };
    }

    await db
      .update(timeEntries)
      .set({ clockOut: jetzt })
      .where(
        and(
          eq(timeEntries.id, offen.id),
          eq(timeEntries.orgId, employee.orgId),
          isNull(timeEntries.clockOut),
        ),
      );
  }

  alleAnsichtenAuffrischen();
  return { ok: true, richtung, zeitpunkt: jetzt.toISOString() };
}

// ============================================================================
// KRANKMELDUNG
// ============================================================================

/** "2026-02-03" → "03.02." (für die Push-Nachricht). */
function kurzesDatum(ymd: string): string {
  const [, monat, tag] = ymd.split("-");
  return `${tag}.${monat}.`;
}

/** Fängt Kalender-Unsinn wie "2026-02-31" ab. */
function istEchtesDatum(ymd: string): boolean {
  const [j, m, t] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.toISOString().slice(0, 10) === ymd;
}

export async function krankMelden(
  von: string,
  bis: string,
): Promise<KrankErgebnis> {
  const { employee } = await requireDeviceEmployee();

  if (!DATUM_RE.test(von) || !DATUM_RE.test(bis)) {
    return { ok: false, error: "Bitte einen gültigen Zeitraum wählen." };
  }
  if (!istEchtesDatum(von) || !istEchtesDatum(bis)) {
    return { ok: false, error: "Bitte einen gültigen Zeitraum wählen." };
  }
  if (bis < von) {
    return {
      ok: false,
      error: "Das Enddatum darf nicht vor dem Startdatum liegen.",
    };
  }

  // Fenster in Berlin-Zeit prüfen — YYYY-MM-DD lässt sich direkt vergleichen.
  const heute = dayKeyBerlin(new Date());
  if (von < shiftYmd(heute, -MAX_TAGE_RUECKWIRKEND)) {
    return {
      ok: false,
      error: `Eine Krankmeldung kann höchstens ${MAX_TAGE_RUECKWIRKEND} Tage rückwirkend erfasst werden. Für ältere Zeiträume wende dich bitte an Sascha.`,
    };
  }
  if (bis > shiftYmd(heute, MAX_TAGE_VORAUS)) {
    return {
      ok: false,
      error: `Eine Krankmeldung kann höchstens ${MAX_TAGE_VORAUS} Tage im Voraus erfasst werden.`,
    };
  }

  // Alle Kalendertage im Zeitraum einsammeln (inklusive Start und Ende).
  const tage: string[] = [];
  for (let tag = von; tag <= bis; tag = shiftYmd(tag, 1)) {
    tage.push(tag);
    if (tage.length > MAX_TAGE) {
      return {
        ok: false,
        error: `Der Zeitraum darf höchstens ${MAX_TAGE} Tage umfassen.`,
      };
    }
  }

  const fensterStart = parseFromBerlinLocal(`${von}T00:00:00`);
  const fensterEnde = parseFromBerlinLocal(`${shiftYmd(bis, 1)}T00:00:00`);

  // Nur freie Kalendertage werden befüllt — bereits gestempelte Schichten
  // bleiben unangetastet und zählen nicht doppelt.
  const { angelegt, uebersprungen } = await db.transaction(async (tx) => {
    const bestehende = await tx
      .select({ clockIn: timeEntries.clockIn })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, employee.orgId),
          eq(timeEntries.employeeId, employee.id),
          gte(timeEntries.clockIn, fensterStart),
          lt(timeEntries.clockIn, fensterEnde),
        ),
      );

    const belegt = new Set(bestehende.map((e) => dayKeyBerlin(e.clockIn)));

    const neu = tage
      .filter((tag) => !belegt.has(tag))
      .map((tag) => ({
        orgId: employee.orgId,
        employeeId: employee.id,
        clockIn: parseFromBerlinLocal(`${tag}T${KRANK_START}`),
        clockOut: parseFromBerlinLocal(`${tag}T${KRANK_ENDE}`),
        sick: true,
      }));

    if (neu.length > 0) {
      // Je Krank-Tag eine Protokollzeile, damit im Admin-Bereich sichtbar
      // bleibt, dass der Eintrag aus einer Selbst-Krankmeldung stammt.
      // Ein Bulk-Insert für alle Tage, keine Query pro Tag.
      const erstellt = await tx
        .insert(timeEntries)
        .values(neu)
        .returning({
          id: timeEntries.id,
          clockIn: timeEntries.clockIn,
          clockOut: timeEntries.clockOut,
        });

      await tx.insert(timeEditLogs).values(
        erstellt.map((eintrag) => ({
          orgId: employee.orgId,
          timeEntryId: eintrag.id,
          employeeId: employee.id,
          fieldChanged: "created",
          oldValue: null,
          newValue: eintrag.clockIn,
          entryClockIn: eintrag.clockIn,
          entryClockOut: eintrag.clockOut,
          reason: KRANK_GRUND,
        })),
      );
    }

    return { angelegt: neu.length, uebersprungen: tage.length - neu.length };
  });

  // Sascha informieren — best effort, darf die Krankmeldung nie scheitern lassen.
  if (angelegt > 0) {
    try {
      if (await isPushConfigured()) {
        const zeitraum =
          von === bis
            ? kurzesDatum(von)
            : `${kurzesDatum(von)}–${kurzesDatum(bis)}`;
        const tageText = tage.length === 1 ? "1 Tag" : `${tage.length} Tage`;
        await sendPushToOrg(employee.orgId, {
          title: "Krankmeldung",
          body: `${employee.name}: ${zeitraum} (${tageText})`,
          url: "/zeiterfassung",
          tag: "krankmeldung",
        });
      }
    } catch (fehler) {
      console.error("[zeit] Push zur Krankmeldung fehlgeschlagen:", fehler);
    }
  }

  alleAnsichtenAuffrischen();
  return { ok: true, angelegt, uebersprungen };
}
