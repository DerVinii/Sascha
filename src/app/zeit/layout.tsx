import type { Metadata } from "next";

/**
 * Rahmen des Mitarbeiter-Bereichs.
 *
 * Bewusst schlank: keine Sidebar, kein CRM, keine Org-Abfrage — Mitarbeiter
 * sehen nur ihre Stempeluhr. Der Schutz liegt allein auf dem Geräte-Cookie
 * (siehe src/lib/server/zeiterfassung/auth.ts); das APP_PASSWORD-Gate greift
 * für /zeit* nicht, weil Mitarbeiter das Passwort nicht kennen.
 *
 * html/body, Schrift und Theme kommen aus dem Root-Layout.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zeiterfassung",
  description: "Ein- und Ausstempeln",
};

export default function ZeitLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="min-h-dvh bg-bg flex flex-col items-center px-4"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
    >
      <header className="w-full max-w-md mb-4">
        <h1 className="text-sm font-semibold text-ink">Zeiterfassung</h1>
        <p className="text-xs text-sub">SK – Dozent und Coach</p>
      </header>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
