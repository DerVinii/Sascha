# SK Kommandozentrale

Vertrieb, Sichtbarkeit und CRM für **SK – Dozent und Coach**. Volle Next.js + Supabase Implementation auf Branch `implementation`.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**
- **Supabase** — Postgres (Storage, Realtime für spätere Phasen)
- **Drizzle ORM** — Schema + Migrations
- **Keine Anmeldung** — die App läuft ohne Login auf einer festen Organisation
- **TanStack Table** — Tabellen
- **dnd-kit** — Drag & Drop für Kanban-Pipeline
- **lucide-react** — Icons

## Setup

```bash
# 1. Dependencies installieren
npm install

# 2. .env.local aus .env.example anlegen und ausfüllen
cp .env.example .env.local

# 3. Supabase-Projekt anlegen (nur als Postgres-Host)
#    https://supabase.com/dashboard → New project (EU-Region wählen)
#    DATABASE_URL (Transaction mode) in .env.local eintragen

# 4. Drizzle Schema in die Datenbank pushen
npm run db:push

# 5. Organisation + Standard-Pipeline anlegen
npm run seed

# 6. Dev-Server starten
npm run dev
```

App läuft auf [http://localhost:3000](http://localhost:3000).

## Verzeichnisstruktur

```
src/
├── app/
│   ├── (app)/                  # App-Routes (ohne Login erreichbar)
│   │   ├── layout.tsx          # Sidebar + Header
│   │   ├── dashboard/page.tsx
│   │   ├── vertrieb/page.tsx
│   │   ├── crm/page.tsx
│   │   ├── aufgaben/page.tsx
│   │   └── einstellungen/page.tsx
│   ├── api/crm/export/route.ts # CSV-Export
│   ├── layout.tsx              # Root
│   ├── page.tsx                # Redirect → /dashboard
│   └── globals.css
├── components/app/
│   ├── sidebar.tsx
│   └── header.tsx
├── db/
│   ├── schema.ts               # Drizzle-Schema (alle Tabellen)
│   └── index.ts                # DB-Client
└── lib/
    ├── server/active-org.ts    # Org-Auflösung (erste Org in der DB)
    └── utils.ts                # cn() helper

scripts/seed-org.ts             # Org + Standard-Pipeline anlegen
scripts/migrate-zeiterfassung.ts # Tabellen der Zeiterfassung anlegen
docs/                           # Specs & Kundenanfragen (PDF, TXT)
```

## Datenbank-Schema

Siehe [src/db/schema.ts](src/db/schema.ts). Architektur-Plan im Plan-File Teil D.

**Phase-1-Tabellen aktiv genutzt:**
- `organizations`, `org_members`, `org_invites` — Multi-Tenant
- `companies`, `contacts`, `tags` — Geteilte Entitäten
- `pipelines`, `pipeline_stages`, `deals` — Vertriebs-CRM
- `activities`, `notes` — Aufgaben & interne Kommentare
- `email_threads`, `email_messages` — Mail-Historie

**Zeiterfassung** (Migration: `npx tsx scripts/migrate-zeiterfassung.ts`):
- `employees`, `employee_devices`, `enrollment_tokens` — Mitarbeiter + per QR gekoppelte Handys
- `time_entries`, `time_edit_logs` — Stempelzeiten + Änderungsprotokoll

Architektur & fachliche Regeln: [`docs/ZEITERFASSUNG_PLAN.md`](docs/ZEITERFASSUNG_PLAN.md).
Optionale Env-Var `NEXT_PUBLIC_APP_URL` — Basis-URL für den Link im QR-Code; ohne sie
wird der Request-Host genommen (im Dev also `localhost`, damit auf dem Handy unbrauchbar).

**Schema angelegt, in Phase 1 ungenutzt (für Phase 2+):**
- `automations` — Workflow-Engine
- `documents` — Dokumentenbibliothek
- `audit_log` — Änderungs-Historie

## Zugang

Die Anmeldung wurde entfernt — es gibt keinen Login. Alle Routes sind direkt
erreichbar und arbeiten auf einer festen Organisation. Diese wird über
[src/lib/server/active-org.ts](src/lib/server/active-org.ts) aufgelöst: standardmäßig
die erste/älteste Org in der DB, optional fest per Env-Var `ACTIVE_ORG_ID`.

> ⚠️ Ohne Login ist die App für jeden mit der URL offen zugänglich. Vor einem
> öffentlichen Produktiv-Einsatz mit echten (DSGVO-relevanten) Kontaktdaten muss
> wieder ein Auth-/Zugriffsschutz davor.

## Phasen-Roadmap

Siehe Plan-File Teil D. Aktueller Vertrag (10.500 € / 6 Wochen) liefert **Phase 1**. Phasen 2–5 als separate Angebote.

## Feature-Status

Lebendiger Überblick mit Status pro PDF-Punkt: [`docs/STATUS.md`](docs/STATUS.md). Diese Datei wird bei jedem Feature-Push aktualisiert und ist die Single Source of Truth für „was kann die App schon".

## Deployment

Vercel-Integration über das Next.js-Framework-Preset. `implementation` ist die aktive Code-Basis der echten App. Für den Produktiv-Launch: Vercel-Project auf `implementation` (bzw. den künftigen Haupt-Branch) ausrichten.
