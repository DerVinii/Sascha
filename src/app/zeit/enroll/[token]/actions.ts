"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices, employees, enrollmentTokens } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { setDeviceCookie } from "@/lib/server/zeiterfassung/auth";
import {
  generateToken,
  hashToken,
} from "@/lib/server/zeiterfassung/tokens";

export type EinrichtenErgebnis = { ok: false; error: string };

/**
 * Koppelt dieses Handy dauerhaft an den Mitarbeiter hinter dem QR-Code.
 *
 * Der Einrichtungs-Code wird erst hier verbraucht (nicht schon beim Öffnen der
 * Seite) — sonst würde ein Vorschau-Abruf von WhatsApp & Co. den Code
 * abbrennen. Der Klartext-Token des Geräts landet ausschließlich im Cookie,
 * in der Datenbank steht nur sein SHA-256.
 */
export async function geraetEinrichten(
  token: string,
  label: string,
): Promise<EinrichtenErgebnis | void> {
  const org = await requireActiveOrg();

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
  if (!row) {
    return { ok: false, error: "Dieser Einrichtungs-Code ist ungültig." };
  }
  if (row.consumed) {
    return {
      ok: false,
      error:
        "Dieser Einrichtungs-Code wurde bereits verwendet. Bitte einen neuen anfordern.",
    };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      error:
        "Dieser Einrichtungs-Code ist abgelaufen. Bitte einen neuen anfordern.",
    };
  }
  if (!row.employeeActive) {
    return { ok: false, error: "Dieses Konto ist nicht aktiv." };
  }

  const geraeteToken = generateToken();
  const geraeteName = label.trim().slice(0, 80) || null;
  const userAgent = (await headers()).get("user-agent");

  const ergebnis = await db.transaction(async (tx) => {
    // Erst den Code entwerten — die Bedingung `consumed = false` macht aus dem
    // Update eine Sperre: zwei parallele Abrufe können ihn nie doppelt nutzen.
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
          "Dieser Einrichtungs-Code wurde bereits verwendet. Bitte einen neuen anfordern.",
      };
    }

    await tx.insert(employeeDevices).values({
      orgId: org.id,
      employeeId: row.employeeId,
      tokenLookup: hashToken(geraeteToken),
      label: geraeteName,
      userAgent: userAgent ?? null,
    });

    return { ok: true as const };
  });

  if (!ergebnis.ok) {
    return { ok: false, error: ergebnis.error };
  }

  await setDeviceCookie(geraeteToken);

  // redirect() wirft intern eine Kontroll-Exception — muss deshalb ganz zum
  // Schluss und außerhalb jeder Transaktion/jedes try-catch stehen.
  redirect("/zeit/stempel");
}
