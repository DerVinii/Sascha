"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices, employees, enrollmentTokens } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  getCurrentDeviceEmployee,
  setDeviceCookie,
} from "@/lib/server/zeiterfassung/auth";
import { generateToken, hashToken } from "@/lib/server/zeiterfassung/tokens";

export type EinloesenErgebnis = { ok: true } | { ok: false; error: string };

/**
 * Löst die Einladung ein: legt das Gerät an und setzt das Geräte-Cookie.
 *
 * WICHTIG — wird bewusst NICHT beim bloßen Öffnen der Seite aufgerufen,
 * sondern erst, wenn die Einrichtung wirklich abgeschlossen wird. Zwei Gründe:
 * Eine Linkvorschau in WhatsApp würde die Einladung sonst abbrennen, bevor der
 * Mitarbeiter sie überhaupt sieht. Und auf dem iPhone hat die installierte App
 * einen eigenen Datenspeicher — ein in Safari gesetztes Cookie gilt dort nicht,
 * also muss der Aufruf aus der App heraus kommen.
 */
export async function einladungEinloesen(
  token: string,
): Promise<EinloesenErgebnis> {
  const org = await requireActiveOrg();

  // Schon gekoppelt? Dann nichts verbrauchen — das passiert, wenn die App nach
  // dem Einrichten erneut auf ihre start_url startet.
  const vorhanden = await getCurrentDeviceEmployee();
  if (vorhanden) return { ok: true };

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
        eq(enrollmentTokens.tokenLookup, hashToken(token)),
        eq(enrollmentTokens.orgId, org.id),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      error:
        "Dieser Link ist ungültig oder abgelaufen. Bitte lass dir von Sascha einen neuen schicken.",
    };
  }
  if (row.consumed) {
    return {
      ok: false,
      error:
        "Dieser Link wurde bereits verwendet. Bitte lass dir von Sascha einen neuen schicken.",
    };
  }
  if (!row.employeeActive) {
    return { ok: false, error: "Dieses Konto ist nicht aktiv." };
  }

  const geraeteToken = generateToken();
  const userAgent = (await headers()).get("user-agent");

  const ergebnis = await db.transaction(async (tx) => {
    // Erst die Einladung entwerten — die Bedingung `consumed = false` macht aus
    // dem Update eine Sperre: zwei parallele Aufrufe können sie nie doppelt
    // nutzen.
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
          "Dieser Link wurde bereits verwendet. Bitte lass dir von Sascha einen neuen schicken.",
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

/** Grobe Gerätebezeichnung für Saschas Geräteliste. */
function geraeteBezeichnung(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android-Handy";
  return null;
}
