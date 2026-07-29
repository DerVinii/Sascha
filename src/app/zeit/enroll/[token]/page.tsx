import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, enrollmentTokens } from "@/db/schema";
import { requireActiveOrg } from "@/lib/server/active-org";
import { hashToken } from "@/lib/server/zeiterfassung/tokens";
import { EnrollForm } from "./_components/enroll-form";

export const dynamic = "force-dynamic";

/**
 * Zielseite des QR-Codes. Der Code wird hier nur GELESEN, nie verbraucht —
 * sonst würde schon der Link-Vorschau-Abruf eines Messengers ihn abbrennen.
 * Verbraucht wird er erst in der Server Action beim Absenden.
 */
export default async function EnrollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const org = await requireActiveOrg();

  const rows = await db
    .select({
      expiresAt: enrollmentTokens.expiresAt,
      consumed: enrollmentTokens.consumed,
      employeeName: employees.name,
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

  let hinweis: string | null = null;
  if (!row) {
    hinweis = "Dieser Einrichtungs-Code ist ungültig.";
  } else if (row.consumed) {
    hinweis =
      "Dieser Einrichtungs-Code wurde bereits verwendet. Bitte einen neuen anfordern.";
  } else if (row.expiresAt.getTime() < Date.now()) {
    hinweis =
      "Dieser Einrichtungs-Code ist abgelaufen. Bitte einen neuen anfordern.";
  } else if (!row.employeeActive) {
    hinweis = "Dieses Konto ist nicht aktiv.";
  }

  if (hinweis) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 space-y-2">
        <h2 className="text-sm font-semibold text-ink">
          Einrichtung nicht möglich
        </h2>
        <p className="text-sm text-sub">{hinweis}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-ink">Gerät einrichten</h2>
        <p className="text-sm text-sub">
          Dieses Gerät wird mit{" "}
          <span className="font-medium text-ink">{row?.employeeName}</span>{" "}
          verknüpft. Danach kannst du auf diesem Handy dauerhaft ein- und
          ausstempeln.
        </p>
      </div>
      <EnrollForm token={token} />
    </div>
  );
}
