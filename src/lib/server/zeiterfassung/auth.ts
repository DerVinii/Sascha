import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeDevices, employees } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { hashToken } from "./tokens";

/**
 * Geräte-Identität für die Mitarbeiter-Zeiterfassung.
 *
 * Mitarbeiter loggen sich nie ein: Ihr Handy wird einmalig per QR gekoppelt
 * und trägt danach dauerhaft dieses Cookie. Der Server schlägt den SHA-256 des
 * Cookies in `employee_devices` nach.
 *
 * Das APP_PASSWORD-Gate greift für `/zeit/*` bewusst NICHT (Mitarbeiter kennen
 * das Passwort nicht) — der Schutz ist ausschließlich dieses Cookie, deshalb
 * muss jede `/zeit`-Seite und -Action selbst prüfen.
 */

export const ZEIT_DEVICE_COOKIE = "sk_zeit_geraet";

/** 730 Tage — das Handy soll nicht ständig neu gekoppelt werden müssen. */
export const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 730;

/** lastSeenAt nur schreiben, wenn der letzte Kontakt länger her ist. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type DeviceSession = {
  employee: { id: string; name: string; orgId: string };
  device: { id: string; label: string | null };
};

export async function setDeviceCookie(token: string) {
  const store = await cookies();
  store.set(ZEIT_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_TTL_SECONDS,
  });
}

export async function clearDeviceCookie() {
  const store = await cookies();
  store.delete(ZEIT_DEVICE_COOKIE);
}

/**
 * Liefert den Mitarbeiter zum Geräte-Cookie — oder null, wenn das Gerät
 * unbekannt, widerrufen, der Mitarbeiter inaktiv oder aus einer anderen
 * Organisation ist.
 */
export async function getCurrentDeviceEmployee(): Promise<DeviceSession | null> {
  const store = await cookies();
  const token = store.get(ZEIT_DEVICE_COOKIE)?.value;
  if (!token) return null;

  const org = await requireActiveOrg();

  const rows = await db
    .select({
      deviceId: employeeDevices.id,
      deviceLabel: employeeDevices.label,
      lastSeenAt: employeeDevices.lastSeenAt,
      employeeId: employees.id,
      employeeName: employees.name,
      employeeOrgId: employees.orgId,
      employeeActive: employees.active,
    })
    .from(employeeDevices)
    .innerJoin(employees, eq(employees.id, employeeDevices.employeeId))
    .where(
      and(
        eq(employeeDevices.tokenLookup, hashToken(token)),
        eq(employeeDevices.revoked, false),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.employeeActive) return null;
  if (row.employeeOrgId !== org.id) return null;

  // Fire-and-forget: darf das Stempeln nie ausbremsen oder scheitern lassen.
  if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    db.update(employeeDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(employeeDevices.id, row.deviceId))
      .catch(() => {});
  }

  return {
    employee: {
      id: row.employeeId,
      name: row.employeeName,
      orgId: row.employeeOrgId,
    },
    device: { id: row.deviceId, label: row.deviceLabel },
  };
}

/** Variante für Server Actions: wirft, wenn kein gültiges Gerät vorliegt. */
export async function requireDeviceEmployee(): Promise<DeviceSession> {
  const session = await getCurrentDeviceEmployee();
  if (!session) {
    throw new Error(
      "Dieses Gerät ist nicht (mehr) eingerichtet. Bitte neuen QR-Code anfordern.",
    );
  }
  return session;
}
