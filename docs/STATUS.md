# SK Kommandozentrale — Funktionsstatus

> **Lebendige Dokumentation.** Quelle: [`CRM_Bildungsoperationssystem_Uebersicht.pdf`](CRM_Bildungsoperationssystem_Uebersicht.pdf) (Saschas PDF mit 12 Kategorien).
> Diese Datei wird bei jedem Feature-Push aktualisiert.

**Stand:** 2026-05-15 · **Aktuelle Phase:** 1 · **Branch:** `implementation`

---

## Legende

| Symbol | Bedeutung |
|---|---|
| ✅ | Voll umgesetzt, getestet |
| ⚠️ | Teilweise (Schema da, UI fehlt — oder anders interpretiert als PDF) |
| ❌ | Fehlt komplett |
| 🔮 | Bewusst in spätere Phase verschoben (siehe Phasen-Roadmap unten) |
| 🐛 | Bekannter Bug / Verbesserung nötig |

---

## Phasen-Roadmap

| Phase | Inhalt | Status |
|---|---|---|
| **0 — Setup** | Next.js, Supabase, Drizzle, Auth, Layout, RLS | ✅ Abgeschlossen |
| **1 — Basis-CRM** | Lead-Inbox, Kontakte, Pipeline, Aufgaben, Dashboard | ✅ Abgeschlossen |
| **2 — Vertriebs-CRM voll** | Multi-Pipeline, Telefonie, Workflow-Automationen, Dokumente | 🔮 Geplant |
| **3 — Bildungs-Operations** | Maßnahmen, Klassenbücher, Anwesenheit | 🔮 Geplant |
| **4 — KI & Mobile** | KI-Doku, Sprachnotizen, Mobile App, Globale Suche | 🔮 Geplant |
| **5 — Dozentenmanagement** | Verfügbarkeit, Honorare | 🔮 Geplant |

---

## 1. Lead- & Kontaktverwaltung

| # | PDF-Punkt | Status | Wo / Anmerkung |
|---|---|---|---|
| 1.1 | Lead-Erfassung | ✅ | `/vertrieb` — manuell + CSV |
| 1.2 | Kontaktverwaltung | ✅ | `/crm` Liste + `/crm/[id]` Detail |
| 1.3 | Firmenverwaltung | ✅ | `companies`-Tabelle, Auto-Dedup beim Anlegen |
| 1.4 | Lead-Statusverwaltung | ✅ | 6 Status (lead → qualified → in_conversation → meeting_booked → won/lost) |
| 1.5 | Lead-Pipelines | ⚠️ | Schema unterstützt mehrere (`pipelines`-Tabelle), UI nur Default-Pipeline. **Multi-Pipeline = Phase 2** |
| 1.6 | Lead-Zuweisung | ❌ | Kein „Assignee"-Feld auf Contacts/Leads. Activities haben `assigneeId`, Contacts nicht. **Reason:** Single-User-Setup, lohnt sich erst bei Team |
| 1.7 | Lead-Filterung | ✅ | Status-Filter-Buttons mit Counts in `/crm` |
| 1.8 | CSV-Import | ✅ | `/vertrieb` mit PapaParse, flexible Spaltennamen |
| 1.9 | CSV-Export | ✅ | `/api/crm/export` mit optionalem `?status=`-Filter, UTF-8-BOM für Excel |
| 1.10 | Dublettenerkennung | ✅ | E-Mail-basiert beim Import, case-insensitive |
| 1.11 | Individuelle Kontaktfelder | ⚠️ | `custom_fields` JSONB-Spalte auf `contacts` + `companies` angelegt, **kein UI**. Schätzung: 8–12 h Aufwand |

---

## 2. Vertrieb & Pipeline

| # | PDF-Punkt | Status | Wo / Anmerkung |
|---|---|---|---|
| 2.1 | Visuelle Vertriebspipeline | ✅ | `/crm?view=pipeline` Kanban mit 6 Spalten |
| 2.2 | Drag-and-Drop Deals | ⚠️ | Drag-Drop ja, aber für **Kontakte** (Status-Update), nicht Deals. **Bewusste Entscheidung:** Sascha als Coach denkt eher in „Kontakten in Pipeline" als in separaten Deal-Records |
| 2.3 | Mehrere Pipelines | ❌ 🔮 | Phase 2. Schema da, UI fehlt |
| 2.4 | Deal-Tracking | ❌ 🔮 | Phase 2. `deals`-Tabelle mit `value_eur`, `probability`, `expected_close` existiert, aber kein UI |
| 2.5 | Aufgabenverwaltung | ✅ | `/aufgaben` mit 5 Typen (Aufgabe, Anruf, Termin, Follow-up, Notiz) |
| 2.6 | Follow-Up-Management | ✅ | Activity-Typ `follow_up` + `due_date` |
| 2.7 | Wiedervorlagen | ✅ | „Heute fällig" / „Überfällig" auf Aufgaben + Dashboard |
| 2.8 | Abschlusswahrscheinlichkeiten | ⚠️ | `pipeline_stages.probability` + `deals.probability` in DB, **nicht im UI** sichtbar |
| 2.9 | Vertriebsautomationen | ❌ 🔮 | Phase 2. `automations`-Tabelle als Hook angelegt |

---

## 3. Telefonie & Calling

**Komplett Phase 2** — braucht externe Telefonie-API (Twilio Voice oder Sipgate).

| # | PDF-Punkt | Status | Anmerkung |
|---|---|---|---|
| 3.1 | Power Dialer | ❌ 🔮 | Phase 2 |
| 3.2 | Automatische Kontaktanwahl | ❌ 🔮 | Phase 2 |
| 3.3 | Call-Tracking | ❌ 🔮 | Activity-Typ `call` existiert für manuelle Erfassung |
| 3.4 | Anrufhistorie | ⚠️ | Manuelle Anlage als Activity möglich, kein Auto-Logging |
| 3.5 | Vertriebs-KPI-Auswertung | ⚠️ | Dashboard zeigt 5 KPIs, kein Call-spezifischer |
| 3.6 | Gesprächsprotokolle | ❌ 🔮 | Phase 2 |

---

## 4. Automatisierungen

**Komplett Phase 2.**

| # | PDF-Punkt | Status |
|---|---|---|
| 4.1 | Workflow-Automationen | ❌ 🔮 |
| 4.2 | E-Mail-Automationen | ❌ 🔮 |
| 4.3 | SMS-Automationen | ❌ 🔮 |
| 4.4 | Automatische Aufgaben | ❌ 🔮 |
| 4.5 | Lead-Routing | ❌ 🔮 |
| 4.6 | Webhooks | ❌ 🔮 |
| 4.7 | Zapier-Anbindung | ❌ 🔮 |
| 4.8 | n8n-Anbindung | ❌ 🔮 |

---

## 5. Dashboard & KPIs

| # | PDF-Punkt | Status | Wo / Anmerkung |
|---|---|---|---|
| 5.1 | Live-Dashboard | ✅ | `/dashboard` mit 5 KPIs + 2 Widgets |
| 5.2 | Umsatztracking | ❌ 🔮 | Phase 2 — hängt an Deal-Tracking (2.4) |
| 5.3 | Conversion-Rates | ❌ 🔮 | Phase 2 |
| 5.4 | Aktivitätsberichte | ⚠️ | „Letzte Kontakte" + „Heute fällig" Widgets, keine echten Reports |
| 5.5 | Forecasting | ❌ 🔮 | Phase 2 — hängt an Deal-Probabilities |
| 5.6 | Teamperformance | ❌ 🔮 | Phase 2 — kein Multi-User aktiv |
| 5.7 | Echtzeitdaten | ⚠️ | Server-rendered, kein Realtime. Supabase Realtime steht bereit, UI nicht angeschlossen |

---

## 6. Bildungs- & Projektverwaltung

**Komplett Phase 3** — eigenes Sub-System laut Plan Teil D.

| # | PDF-Punkt | Status |
|---|---|---|
| 6.1 | Maßnahmenverwaltung | ❌ 🔮 |
| 6.2 | Projektverwaltung | ❌ 🔮 |
| 6.3 | Fachbereichsstruktur | ❌ 🔮 |
| 6.4 | Standortverwaltung | ❌ 🔮 |
| 6.5 | Projektstatus | ❌ 🔮 |
| 6.6 | Zeit- & Terminverwaltung | ❌ 🔮 |
| 6.7 | Kundenportal für Bildungsträger | ❌ 🔮 |

---

## 7. Digitale Klassenbücher & Nachweise

**Komplett Phase 3.**

| # | PDF-Punkt | Status |
|---|---|---|
| 7.1 | Digitale Klassenbücher | ❌ 🔮 |
| 7.2 | Anwesenheitsverwaltung | ❌ 🔮 |
| 7.3 | Unterrichtsdokumentation | ❌ 🔮 |
| 7.4 | PDF-Erstellung automatisch | ❌ 🔮 |
| 7.5 | Archivierung | ❌ 🔮 |
| 7.6 | Teilnehmerübersichten | ❌ 🔮 |

---

## 8. Dokumenten- & Kommunikationssystem

| # | PDF-Punkt | Status | Anmerkung |
|---|---|---|---|
| 8.1 | Dokumentenbibliothek | ❌ 🔮 | Phase 2. `documents`-Tabelle als Hook angelegt |
| 8.2 | Kommunikations-Timeline | ⚠️ | Mail-Historie + Aktivitäten auf `/crm/[id]`, nicht als kombinierte Timeline-View |
| 8.3 | E-Mail-Verläufe | ⚠️ | `email_threads`/`email_messages`-Schema da, Anzeige läuft. **Mail-Versand/-Empfang = Phase 2** |
| 8.4 | Interne Kommentare | ✅ | Notizen pro Kontakt auf `/crm/[id]` |
| 8.5 | Vorlagen mit Autovervollständigung | ❌ 🔮 | Phase 2. `document_templates`-Schema vorbereitet |
| 8.6 | Automatische Dateibenennung | ❌ 🔮 | Phase 2. Hängt an Upload |

---

## 9. Mobile & Benutzerfreundlichkeit

| # | PDF-Punkt | Status | Anmerkung |
|---|---|---|---|
| 9.1 | Mobile Optimierung | ✅ | Tailwind responsive überall (`md:` breakpoints) |
| 9.2 | Dunkelmodus | ❌ | Aufwand ~6 h, außerhalb Phase-1-Scope |
| 9.3 | Globale Suche | ❌ 🔮 | Phase 4 — braucht Postgres Full-Text Search oder Typesense |
| 9.4 | Favoriten & Schnellzugriffe | ❌ 🔮 | Phase 4 |
| 9.5 | Schnellstatus per Klick | ✅ | Inline Status-Select auf Detail-Page + Drag im Kanban |
| 9.6 | Sprachnotizen | ❌ 🔮 | Phase 4 — braucht Audio-API + Speech-to-Text |

---

## 10. Intelligente Komfortfunktionen

| # | PDF-Punkt | Status | Anmerkung |
|---|---|---|---|
| 10.1 | Intelligente Startseite | ⚠️ | KPIs + Widgets vorhanden, keine personalisierten Vorschläge |
| 10.2 | Automatische Erinnerungen | ❌ 🔮 | Phase 2 — braucht Cron/Webhook |
| 10.3 | Checklisten | ❌ 🔮 | Phase 4 — Nice-to-have |
| 10.4 | Zuletzt verwendete Elemente | ❌ 🔮 | Phase 4 |
| 10.5 | Ein-Klick-Aktionen | ✅ | „Lead qualifizieren"-Button in `/vertrieb`, Drag-Drop in Pipeline |
| 10.6 | Automatische Ordnerstruktur | ❌ 🔮 | Phase 2 — hängt an Dokumentenbibliothek |
| 10.7 | Zentraler Uploadbereich | ❌ 🔮 | Phase 2 |

---

## 11. KI- & Zukunftsfunktionen

**Komplett Phase 4.**

| # | PDF-Punkt | Status |
|---|---|---|
| 11.1 | KI-Dokumentenerstellung | ❌ 🔮 |
| 11.2 | Projektgenerator | ❌ 🔮 |
| 11.3 | Automatische Berichte | ❌ 🔮 |
| 11.4 | Intelligente Vorschläge | ❌ 🔮 |
| 11.5 | Automatische Statuslogik | ❌ 🔮 |

---

## 12. Strategische Systemstruktur

| # | PDF-Punkt | Status | Anmerkung |
|---|---|---|---|
| 12.1 | Separates Vertriebssystem | ⚠️ | UI-Trennung in Modulen, aber gleicher DB-Layer |
| 12.2 | Eigenständiges Bildungs-Operations-System | ❌ 🔮 | Phase 3 — Schema-Trennung im Plan Teil D vorgesehen |
| 12.3 | Später separates Dozentenmanagement | ❌ 🔮 | Phase 5 |
| 12.4 | API- & Webhook-Struktur | ❌ 🔮 | Phase 2 |
| 12.5 | Modulare Skalierung | ✅ | Multi-Tenant, RLS, Schema-Hooks für alle Phasen |
| 12.6 | SaaS-/Lizenzpotenzial | ✅ | Architektur multi-tenant-fähig (`org_id` auf jeder Tabelle) |

---

## Tech-Debt & bekannte Verbesserungen

### 🐛 Sicherheit
- **Drizzle nutzt Direct-Connection (postgres role) → RLS wird BYPASSED.** Server-Actions filtern manuell via `requireActiveOrg()`. Vor Production-Launch: separate Application-Role mit aktiver RLS, oder Supabase-JS-Client für Read-Operations
- **AV-Vertrag mit Sascha noch offen** — wer ist DSGVO-Verantwortlicher?

### 🐛 UX
- Native `alert()` / `confirm()` statt Toast-Notifications (Lösch-Bestätigung in Lead-Inbox, Aufgaben)
- Keine Loading-Skeletons in Listen — nur Empty-States
- Keine Optimistic-UI bei `createContactAction` (User sieht Redirect, kein Spinner zwischendurch)

### 🐛 Daten
- Keine Indizes auf `(org_id, status)` Composite — Performance prüfen bei >10k Kontakten
- Keine Pagination — Limit 200/500 hardcoded, danach truncated ohne Warnung
- `audit_log` Tabelle angelegt, aber nichts wird geschrieben

### 🐛 Realtime
- Supabase Realtime aktiviert, aber Frontend nicht subscribed — bei zwei offenen Tabs kein Live-Update

### 🐛 Klärung mit Sascha offen (siehe Plan Teil D)
1. Welche Lead-Quellen Phase 1 zwingend?
2. Eine Pipeline reicht? Oder schon Multi?
3. Welche Custom-Fields sind essenziell?
4. Mail-Versand aus CRM heraus Phase 1 oder Phase 2?
5. Telefon-Workflow: wie viele Calls macht Sascha?
6. DSGVO-Verantwortlichkeit?

---

## Phase-1-Bilanz

| Kategorie | Voll ✅ | Teilweise ⚠️ | Fehlt (bewusst) 🔮 | Fehlt (versehen) ❌ |
|---|---:|---:|---:|---:|
| 1. Lead & Kontakte | 8 | 2 | 0 | 1 |
| 2. Vertrieb & Pipeline | 4 | 2 | 3 | 0 |
| 3. Telefonie | 0 | 2 | 4 | 0 |
| 4. Automatisierungen | 0 | 0 | 8 | 0 |
| 5. Dashboard | 1 | 3 | 3 | 0 |
| 6. Bildungs-Verwaltung | 0 | 0 | 7 | 0 |
| 7. Klassenbücher | 0 | 0 | 6 | 0 |
| 8. Dokumente & Kommunikation | 1 | 2 | 3 | 0 |
| 9. Mobile & UX | 2 | 0 | 3 | 1 |
| 10. Komfortfunktionen | 1 | 1 | 5 | 0 |
| 11. KI | 0 | 0 | 5 | 0 |
| 12. Systemstruktur | 2 | 1 | 3 | 0 |
| **Σ** | **19** | **13** | **50** | **2** |

**~84 PDF-Punkte total.** Phase 1 = 19 voll + 13 teilweise = **32 aktiv (38 %)**. 50 sind bewusst spätere Phasen. 2 echte Versäumnisse (Lead-Zuweisung, Dunkelmodus).

---

## Wie du diese Datei pflegst

Bei jedem Feature-Push:
1. Status-Symbol aktualisieren (❌ → ⚠️ → ✅)
2. „Wo / Anmerkung"-Spalte mit Route/Datei ergänzen
3. Datum oben aktualisieren
4. Falls neuer Bug entdeckt → unter „Tech-Debt" eintragen
5. Beim Phasenwechsel: oben Phase-Header updaten

Diese Datei ist die **Single Source of Truth** für „was kann die App schon".
