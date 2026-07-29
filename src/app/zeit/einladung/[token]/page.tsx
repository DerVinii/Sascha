import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, enrollmentTokens } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { getCurrentDeviceEmployee } from "@/lib/server/zeiterfassung/auth";
import { hashToken } from "@/lib/server/zeiterfassung/tokens";
import { Einrichtung } from "./_components/einrichtung";

export const dynamic = "force-dynamic";

/**
 * Jede Einladung meldet ihr EIGENES Manifest, dessen `start_url` auf genau
 * diese Seite zeigt. Das ist der Kern der Einrichtung: Startet der Mitarbeiter
 * die frisch installierte App, landet er wieder hier — diesmal aber im
 * Datenspeicher der App. Erst dort wird die Einladung eingelöst und das
 * Geräte-Cookie gesetzt. Auf dem iPhone ist das der einzige Weg, weil eine
 * installierte Web-App die Cookies aus Safari nicht sieht.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Stempeluhr einrichten",
    manifest: `/zeit/einladung/${encodeURIComponent(token)}/manifest`,
  };
}

export default async function EinladungPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Ist das Gerät schon gekoppelt, ist die Einrichtung vorbei. Dieser Fall
  // tritt bei JEDEM App-Start ein, weil die start_url der App auf diese Seite
  // zeigt — deshalb hier direkt weiter zur Stempeluhr.
  const session = await getCurrentDeviceEmployee();
  if (session) redirect("/zeit/stempel");

  const org = await requireActiveOrg();
  const [einladung] = await db
    .select({
      name: employees.name,
      expiresAt: enrollmentTokens.expiresAt,
      consumed: enrollmentTokens.consumed,
      aktiv: employees.active,
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

  const ungueltig =
    !einladung ||
    einladung.consumed ||
    !einladung.aktiv ||
    einladung.expiresAt.getTime() < Date.now();

  if (ungueltig) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">
          Dieser Link gilt nicht mehr
        </h2>
        <p className="mt-2 text-sm text-sub">
          Er wurde entweder schon verwendet oder ist abgelaufen. Bitte lass dir
          von Sascha einen neuen Link schicken.
        </p>
        <p className="mt-3 text-xs text-sub">
          Falls du die App schon eingerichtet hattest: Öffne sie über das Symbol
          auf dem Startbildschirm.
        </p>
      </div>
    );
  }

  const vorname = einladung.name.trim().split(/\s+/)[0] || einladung.name;
  return <Einrichtung token={token} vorname={vorname} />;
}
