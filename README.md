# SK Kommandozentrale

Vertrieb, Sichtbarkeit und CRM für **SK – Dozent und Coach**. Volle Next.js + Supabase Implementation auf Branch `implementation`. Der UI-Prototyp (single-file HTML) liegt auf Branch `main` und in [`prototype/`](prototype/).

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**
- **Supabase** — Auth (Magic Link), Postgres + RLS, Storage, Realtime
- **Drizzle ORM** — Schema + Migrations
- **TanStack Table** — Tabellen
- **dnd-kit** — Drag & Drop für Kanban-Pipeline
- **lucide-react** — Icons

## Setup

```bash
# 1. Dependencies installieren
npm install

# 2. .env.local aus .env.example anlegen und ausfüllen
cp .env.example .env.local

# 3. Supabase-Projekt anlegen
#    https://supabase.com/dashboard → New project (EU-Region wählen)
#    SUPABASE_URL und ANON_KEY in .env.local eintragen
#    DATABASE_URL (Transaction mode) in .env.local eintragen

# 4. Drizzle Schema in die Datenbank pushen
npm run db:push

# 5. Dev-Server starten
npm run dev
```

App läuft auf [http://localhost:3000](http://localhost:3000).

## Verzeichnisstruktur

```
src/
├── app/
│   ├── (app)/                  # Authenticated routes
│   │   ├── layout.tsx          # Sidebar + Header
│   │   ├── dashboard/page.tsx
│   │   ├── vertrieb/page.tsx
│   │   ├── crm/page.tsx
│   │   └── einstellungen/page.tsx
│   ├── auth/callback/route.ts  # OAuth/Magic-Link-Callback
│   ├── login/page.tsx          # Public login
│   ├── layout.tsx              # Root
│   ├── page.tsx                # Redirect → /dashboard
│   └── globals.css
├── components/app/
│   ├── sidebar.tsx
│   └── header.tsx
├── db/
│   ├── schema.ts               # Drizzle-Schema (alle Tabellen)
│   └── index.ts                # DB-Client
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser-Client
│   │   ├── server.ts           # Server-Client
│   │   └── middleware.ts       # Session-Refresh + Redirects
│   └── utils.ts                # cn() helper
└── middleware.ts               # Next.js Middleware

docs/                           # Specs & Kundenanfragen (PDF, TXT)
prototype/                      # Alter HTML-Prototyp (Referenz)
```

## Datenbank-Schema

Siehe [src/db/schema.ts](src/db/schema.ts). Architektur-Plan im Plan-File Teil D.

**Phase-1-Tabellen aktiv genutzt:**
- `organizations`, `org_members`, `org_invites` — Multi-Tenant
- `companies`, `contacts`, `tags` — Geteilte Entitäten
- `pipelines`, `pipeline_stages`, `deals` — Vertriebs-CRM
- `activities`, `notes` — Aufgaben & interne Kommentare
- `email_threads`, `email_messages` — Mail-Historie

**Schema angelegt, in Phase 1 ungenutzt (für Phase 2+):**
- `automations` — Workflow-Engine
- `documents` — Dokumentenbibliothek
- `audit_log` — Änderungs-Historie

## Auth-Flow

1. User gibt E-Mail auf `/login` ein
2. Supabase schickt Magic-Link
3. Klick auf Link → `/auth/callback` → Session-Cookie → Redirect zu `/dashboard`
4. Middleware ([src/middleware.ts](src/middleware.ts)) blockt unauthentifizierte Requests auf alle Routes außer `/login` und `/auth`

## Phasen-Roadmap

Siehe Plan-File Teil D. Aktueller Vertrag (10.500 € / 6 Wochen) liefert **Phase 1**. Phasen 2–5 als separate Angebote.

## Feature-Status

Lebendiger Überblick mit Status pro PDF-Punkt: [`docs/STATUS.md`](docs/STATUS.md). Diese Datei wird bei jedem Feature-Push aktualisiert und ist die Single Source of Truth für „was kann die App schon".

## Deployment

Vercel-Integration: Branch `implementation` → Preview, `main` → Production-Prototyp. Vor Produktiv-Switch der echten App: Vercel-Project umkonfigurieren oder neues Project auf `implementation` anlegen.
