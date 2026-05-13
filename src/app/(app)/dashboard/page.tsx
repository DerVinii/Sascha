export default function DashboardPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink">Willkommen zurück</h2>
        <p className="text-sm text-sub mt-1">
          Phase 0 läuft — Auth, Datenbank und Layout sind eingerichtet. KPI-Cards
          und Widgets folgen in Phase 1.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {[
          { label: "Aktive Kampagnen", value: "—" },
          { label: "Leads diesen Monat", value: "—" },
          { label: "Antwortrate", value: "—" },
          { label: "Termine gebucht", value: "—" },
          { label: "Offene Aufgaben", value: "—" },
          { label: "Offene Kontakte", value: "—" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-line bg-surface p-4 md:p-5"
          >
            <div className="text-[11px] md:text-xs font-medium text-sub">
              {kpi.label}
            </div>
            <div className="mt-1.5 md:mt-2 text-xl md:text-2xl font-semibold text-ink">
              {kpi.value}
            </div>
            <div className="mt-1.5 md:mt-2 text-[10px] md:text-xs text-sub">
              wird verfügbar mit echten Daten
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h3 className="text-sm font-semibold text-ink mb-2">
          Phase 0 — Setup abgeschlossen
        </h3>
        <ul className="text-sm text-sub space-y-1.5">
          <li>✓ Next.js 15 + TypeScript + Tailwind</li>
          <li>✓ Supabase Auth (Magic Link)</li>
          <li>✓ Drizzle ORM + Postgres Schema</li>
          <li>✓ Multi-Tenant-Layer (organizations, org_members, RLS-Ready)</li>
          <li>✓ Layout + Sidebar + Header</li>
        </ul>
        <p className="text-xs text-sub mt-4">
          Nächste Schritte (Phase 1): Kontakte-CRUD, Pipeline-Kanban,
          Lead-Inbox, Mail-Historie.
        </p>
      </div>
    </div>
  );
}
