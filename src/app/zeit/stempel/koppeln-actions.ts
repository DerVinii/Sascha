"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices, employees, enrollmentTokens } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { setDeviceCookie } from "@/lib/server/zeiterfassung/auth";
import { generateToken, hashToken } from "@/lib/server/zeiterfassung/tokens";
import { istVollstaendig, normalisiereCode } from "@/lib/kopplungscode";

export type KoppelErgebnis = { ok: true } | { ok: false; error: string };

/**
 * Koppelt dieses Gerät über den Code, den Sascha vorliest.
 *
 * Die Kopplung passiert bewusst hier, in der bereits installierten App, und
 * nicht vorher über einen Link im Browser: Auf dem iPhone hat eine zum
 * Startbildschirm hinzugefügte App einen eigenen Datenspeicher: Ein in Safari
 * gesetztes Cookie gilt dort nicht. Wer erst installiert und dann koppelt,
 * landet immer im richtigen Speicher — unabhängig davon, wie das jeweilige
 * Handy das handhabt.
 *
 * Der Klartext-Token des Geräts landet ausschließlich im Cookie, in der
 * Datenbank steht nur sein SHA-256.
 */
export async function mitCodeKoppeln(eingabe: string): Promise<KoppelErgebnis> {
  const org = await requireActiveOrg();

  const code = normalisiereCode(eingabe);
  if (!istVollstaendig(code)) {
    return {
      ok: false,
      error: "Bitte den vollständigen Code eingeben (8 Zeichen).",
    };
  }

  const rows = await db
    .select({
      tokenId: enrollmentTokens.id,
      employeeId: enrollmentTokens.employeeId,
      expiresAt: enrollmentTokens.expiresAt,
      consumed: enrollmentTokens.consumed,
      employeeActive: employees.active,
    })
    .from(enrollmentTokens)
    .innerJoin(employees, eq(employees.id, enrollmentTokens.employeeId))
    .where(
      and(
        eq(enrollmentTokens.tokenLookup, hashToken(code)),
        eq(enrollmentTokens.orgId, org.id),
      ),
    )
    .limit(1);

  const row = rows[0];
  // Bewusst dieselbe Meldung wie bei einem abgelaufenen Code: Wer raten will,
  // soll nicht erfahren, ob ein Code existiert.
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      error:
        "Dieser Code ist ungültig oder abgelaufen. Bitte lass dir von Sascha einen neuen geben.",
    };
  }
  if (row.consumed) {
    return {
      ok: false,
      error:
        "Dieser Code wurde bereits verwendet. Bitte lass dir von Sascha einen neuen geben.",
    };
  }
  if (!row.employeeActive) {
    return { ok: false, error: "Dieses Konto ist nicht aktiv." };
  }

  const geraeteToken = generateToken();
  const userAgent = (await headers()).get("user-agent");

  const ergebnis = await db.transaction(async (tx) => {
    // Erst den Code entwerten — die Bedingung `consumed = false` macht aus dem
    // Update eine Sperre: zwei parallele Versuche können ihn nie doppelt nutzen.
    const entwertet = await tx
      .update(enrollmentTokens)
      .set({ consumed: true, consumedAt: new Date() })
      .where(
        and(
          eq(enrollmentTokens.id, row.tokenId),
          eq(enrollmentTokens.consumed, false),
        ),
      )
      .returning({ id: enrollmentTokens.id });

    if (entwertet.length === 0) {
      return {
        ok: false as const,
        error:
          "Dieser Code wurde bereits verwendet. Bitte lass dir von Sascha einen neuen geben.",
      };
    }

    await tx.insert(employeeDevices).values({
      orgId: org.id,
      employeeId: row.employeeId,
      tokenLookup: hashToken(geraeteToken),
      label: geraeteBezeichnung(userAgent),
      userAgent: userAgent ?? null,
    });

    return { ok: true as const };
  });

  if (!ergebnis.ok) return ergebnis;

  await setDeviceCookie(geraeteToken);

  revalidatePath("/zeit/stempel");
  revalidatePath("/zeit/meine-zeiten");
  // Damit Sascha das neue Gerät sofort in der Geräteliste sieht.
  revalidatePath("/zeiterfassung", "layout");

  return { ok: true };
}

/**
 * Grobe Gerätebezeichnung aus dem User-Agent, damit Sascha in der Geräteliste
 * etwas Lesbares sieht. Früher tippte der Mitarbeiter den Namen selbst ein —
 * ein Feld, das auf dem Weg zum Stempeln nur im Weg stand.
 */
function geraeteBezeichnung(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android-Handy";
  return null;
}
