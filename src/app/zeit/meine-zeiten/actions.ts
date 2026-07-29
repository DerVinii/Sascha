"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices } from "@/db/schema";
import {
  clearDeviceCookie,
  requireDeviceEmployee,
} from "@/lib/server/zeiterfassung/auth";

export type AbmeldenErgebnis = { ok: false; error: string };

/**
 * Meldet GENAU DIESES Handy ab — für den Gerätewechsel oder wenn ein
 * Mitarbeiter sein Diensthandy abgibt.
 *
 * Das Cookie allein zu löschen reicht nicht: Wer es vorher kopiert hat, käme
 * damit weiter rein. Deshalb wird der Geräte-Eintrag serverseitig auf
 * `revoked` gesetzt — der Token ist danach tot, auch mit Cookie in der Hand.
 * Ein neuer QR-Code von Sascha ist zum Wiederanmelden nötig.
 */
export async function geraetAbmelden(): Promise<AbmeldenErgebnis | void> {
  const { employee, device } = await requireDeviceEmployee();

  await db
    .update(employeeDevices)
    .set({ revoked: true })
    .where(
      and(
        eq(employeeDevices.id, device.id),
        eq(employeeDevices.orgId, employee.orgId),
      ),
    );

  await clearDeviceCookie();

  revalidatePath("/zeit/stempel");
  revalidatePath("/zeit/meine-zeiten");
  revalidatePath("/zeiterfassung", "layout");

  // redirect() wirft intern eine Kontroll-Exception — muss deshalb ganz zum
  // Schluss stehen.
  redirect("/zeit/stempel");
}
