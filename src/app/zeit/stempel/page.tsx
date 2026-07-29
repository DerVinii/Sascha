import Link from "next/link";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";
import { getCurrentDeviceEmployee } from "@/lib/server/zeiterfassung/auth";
import { dayKeyBerlin, formatDateTime } from "@/lib/zeiterfassung";
import { KrankDialog } from "./_components/krank-dialog";
import {
  StempelClient,
  type LetzterWechsel,
} from "./_components/stempel-client";

export const dynamic = "force-dynamic";

/** Begrüßung nach der Tageszeit in Berlin (der Server läuft in UTC). */
function begruessung(jetzt: Date): string {
  const stunde = Number(formatDateTime(jetzt, "H"));
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 18) return "Guten Tag";
  return "Guten Abend";
}

export default async function StempelPage() {
  const session = await getCurrentDeviceEmployee();

  // Kein gültiges Geräte-Cookie: bewusst KEIN Redirect auf /zugang — Mitarbeiter
  // kennen das App-Passwort nicht und würden dort nur stranden.
  //
  // Die Einrichtung läuft über den Einladungslink, den Sascha verschickt
  // (/zeit/einladung/[token]) — hier gibt es deshalb nichts einzutippen.
  if (!session) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">
          Dieses Gerät ist nicht angemeldet
        </h2>
        <p className="mt-2 text-sm text-sub">
          Bitte lass dir von Sascha den Einrichtungs-Link schicken und öffne ihn
          auf diesem Handy.
        </p>
        <p className="mt-3 text-xs text-sub">
          Wenn du die App schon eingerichtet hattest: Öffne sie über das Symbol
          auf dem Startbildschirm — im Browser gilt die Anmeldung unter Umständen
          nicht.
        </p>
      </div>
    );
  }

  const { employee } = session;
  const jetzt = new Date();

  const [laufend] = await db
    .select({ clockIn: timeEntries.clockIn })
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

  // Ohne laufenden Eintrag zeigen wir den letzten Ausstempel-Zeitpunkt.
  let letzterWechsel: LetzterWechsel | null = null;
  if (laufend) {
    letzterWechsel = {
      art: "ein",
      zeitpunkt: laufend.clockIn.toISOString(),
      heute: dayKeyBerlin(laufend.clockIn) === dayKeyBerlin(jetzt),
    };
  } else {
    const [letzter] = await db
      .select({ clockOut: timeEntries.clockOut })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, employee.orgId),
          eq(timeEntries.employeeId, employee.id),
          isNotNull(timeEntries.clockOut),
          eq(timeEntries.sick, false),
        ),
      )
      .orderBy(desc(timeEntries.clockOut))
      .limit(1);

    if (letzter?.clockOut) {
      letzterWechsel = {
        art: "aus",
        zeitpunkt: letzter.clockOut.toISOString(),
        heute: dayKeyBerlin(letzter.clockOut) === dayKeyBerlin(jetzt),
      };
    }
  }

  const vorname = employee.name.trim().split(/\s+/)[0] || employee.name;

  return (
    // Rahmen (Hintergrund, Safe-Area, Kopfzeile, <main class="max-w-md">) kommt
    // aus src/app/zeit/layout.tsx — hier nur der Inhalt.
    <div className="space-y-6">
      <header className="text-center">
        <p className="text-sm text-sub">{begruessung(jetzt)}</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">{vorname}</h2>
      </header>

      <div className="mx-auto w-full max-w-sm space-y-3">
        <StempelClient
          laufendSeit={laufend ? laufend.clockIn.toISOString() : null}
          letzterWechsel={letzterWechsel}
        />
        <KrankDialog />
      </div>

      <footer className="text-center">
        <Link
          href="/zeit/meine-zeiten"
          className="text-sm text-sub underline-offset-4 hover:text-ink hover:underline"
        >
          Meine Zeiten
        </Link>
      </footer>
    </div>
  );
}
