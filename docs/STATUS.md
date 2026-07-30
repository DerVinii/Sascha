# SK Kommandozentrale — Funktionsstatus

> **Lebendige Dokumentation.** Quelle: [`CRM_Bildungsoperationssystem_Uebersicht.pdf`](CRM_Bildungsoperationssystem_Uebersicht.pdf) (Saschas PDF mit 12 Kategorien).
> Diese Datei wird bei jedem Feature-Push aktualisiert.

**Stand:** 2026-07-29 · **Aktuelle Phase:** 1 (+ SalesSuite-CRM-Nachbau) · **Branch:** `main`

> 🔗 **Einrichtung per Link (2026-07-30):** „Neuer Mitarbeiter" liefert direkt einen **Einrichtungs-Link** zum Verschicken (Kopieren oder WhatsApp). Der Mitarbeiter öffnet ihn, wählt iPhone oder Android, bekommt die passende Anleitung — und ist nach der Installation **automatisch angemeldet**, ohne Code und ohne Passwort. Möglich macht das ein **eigenes Manifest pro Einladung**, dessen `start_url` auf die Einladungsseite zeigt: Die frisch installierte App startet dort noch einmal und löst die Einladung in ihrem eigenen Datenspeicher ein — der einzige Weg, der auch auf dem iPhone trägt. Der Kopplungscode entfällt.
>
> 📱 **Stempeluhr als eigene App (2026-07-30):** `/zeit*` meldet ein eigenes PWA-Manifest („SK Zeit", teal-grüne Uhr, `scope: /zeit`) — Mitarbeiter installieren die Stempeluhr getrennt von der Kommandozentrale, beide Symbole liegen unterscheidbar nebeneinander. Die Kopplung läuft jetzt über einen **8-stelligen Code, der IN der installierten App eingetippt wird**, statt über einen QR-Link: Auf dem iPhone hat eine installierte Web-App einen eigenen Datenspeicher, ein in Safari gesetztes Cookie gilt dort nicht. `/zeit` ist die Installationsanleitung (plattformabhängig), `/zeit/enroll/[token]` entfällt. ⚠️ `app/manifest.ts` wurde entfernt — beide Manifeste liegen als statische Dateien in `public/`, weil die Next-Datei-Konvention sich in einem Unter-Layout nicht überschreiben lässt. Steht noch aus: Test auf echtem iPhone und Android-Gerät.
>
> ⏱ **Zeiterfassung live (2026-07-29):** Deployt und gegen die Produktion abgenommen; `NEXT_PUBLIC_APP_URL` ist in Vercel gesetzt (nötig für die QR-Links — `NEXT_PUBLIC_`-Werte werden beim Build eingesetzt, eine Wertänderung braucht also ein Redeploy). Sascha kann unter `/zeiterfassung` den ersten Mitarbeiter anlegen.
>
> ⏱ **Zeiterfassung integriert (2026-07-29):** Neuer Reiter `/zeiterfassung` (Admin, hinter dem Passwort-Gate) + Mitarbeiterbereich `/zeit/*` (bewusst vom Gate ausgenommen, geschützt durch das Geräte-Cookie `sk_zeit_geraet`). Mitarbeiter stempeln per Handy, das Gerät wird einmalig per QR-Code gekoppelt. Fachlogik portiert aus einem bestehenden System eines anderen Kunden — **ohne** Geofence/Standortabfrage und ohne Außendienst-/Homeoffice-Flags. Plan & Architektur: [`ZEITERFASSUNG_PLAN.md`](ZEITERFASSUNG_PLAN.md).

> ⚙️ **Einstellungen-Reiter ausgebaut (2026-07-03):** `/einstellungen` mit Unternavigation — **Organisation** (Name, Datenbestand), **Kontaktfelder** (Custom Fields, 7 Typen, Detail-Seite + Tabellen-Spalten), **Tags** (Verwaltung + Zuweisung + Migration unverwalteter Tags), **Integrationen** (Status + Verbindungstest Instantly/Places/Gemini), **Daten** (CSV-Exporte Kontakte/Firmen/Deals), **Darstellung** (Dunkelmodus Hell/Dunkel/System) und **Sicherheit** (Passwort-Gate, aktiv sobald Env `APP_PASSWORD` gesetzt ist). Plan: [`EINSTELLUNGEN_PLAN.md`](EINSTELLUNGEN_PLAN.md).

> 🔧 **CRM-Nachbau gestartet (2026-06-28):** Die CRM-Sektion wird an Saschas aktuelles Tool **SalesSuite** angeglichen. Feature-Spec + Gap-Analyse: [`SALESSUITE_REFERENCE.md`](SALESSUITE_REFERENCE.md). **Fundament fertig:** Deals als eigene Ebene, Multi-Pipeline-Verwaltung, Deal-Kanban (Drag-Drop), Deals an Kontakten.

> 📬 **Postfach live (2026-07-03):** Der Reiter Postfach ist an Instantly angebunden — **Unibox** (`/postfach/unibox`: Antworten aus Kampagnen lesen/beantworten, Gelesen-Status, Lead-Interest, Kontakt-Match ins CRM; gefüllt per `reply_received`-Webhook + Poll-Backfill) und **Sending-Accounts** (`/postfach/accounts`: Status/Warmup/Health, Pause/Resume). Plan & Architektur: [`POSTFACH_PLAN.md`](POSTFACH_PLAN.md). Outlook-Anbindung wartet auf Klärung des Postfach-Typs (Fall a/b/c, Plan §9). Watch-Item: Instantlys *Test*-Deliveries senden den `x-webhook-secret`-Header nicht mit (→ 401, erwartet); echte Deliveries laut Doku schon — beim ersten echten Reply in den Vercel-Logs gegenprüfen.

> ⚠️ **Anmeldung entfernt (2026-06-05):** Die App läuft jetzt **ohne Login** auf einer festen Organisation und ist öffentlich live unter https://sascha-wyvernai.vercel.app. Auth (Magic-Link/Passwort) wurde komplett ausgebaut, die Vercel-Protection deaktiviert. Details unter „Tech-Debt → Sicherheit".

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
| **0 — Setup** | Next.js, Supabase, Drizzle, ~~Auth~~ (entfernt), Layout, RLS | ✅ Abgeschlossen |
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
| 1.11 | Individuelle Kontaktfelder | ✅ | `/einstellungen/kontaktfelder` — Felddefinitionen (Text/Zahl/Datum/Auswahl/Checkbox/URL/Telefon), editierbar auf `/crm/[id]`, optional als Spalte in der Kontakte-Tabelle. Werte in `custom_fields.fields` |

---

## 2. Vertrieb & Pipeline

| # | PDF-Punkt | Status | Wo / Anmerkung |
|---|---|---|---|
| 2.1 | Visuelle Vertriebspipeline | ✅ | `/crm?view=pipeline` Deal-Kanban, Spalten = Phasen der gewählten Pipeline |
| 2.2 | Drag-and-Drop Deals | ✅ | Echte **Deals** werden per Drag-Drop zwischen Phasen bewegt (optimistisch + Rollback) |
| 2.3 | Mehrere Pipelines | ✅ | Pipeline-Selector + „Neue Pipeline" (5 Vorlagen) + Phasen-Verwaltung (Name/Farbe/%/Reihenfolge) |
| 2.4 | Deal-Tracking | ✅ | Deals mit `value_eur` + `expected_close`; Phasen-Wahrscheinlichkeit; Summen pro Phase/Pipeline. Verlust-Grund/Close-Datum-Automatik = später |
| 2.5 | Aufgabenverwaltung | ⚠️ | Reiter `/aufgaben` bewusst entfernt (2026-07-03). Activities-Schema bleibt; „Heute fällig" auf dem Dashboard |
| 2.6 | Follow-Up-Management | ✅ | Activity-Typ `follow_up` + `due_date` |
| 2.7 | Wiedervorlagen | ✅ | „Heute fällig" / „Überfällig" auf Aufgaben + Dashboard |
| 2.8 | Abschlusswahrscheinlichkeiten | ⚠️ | `pipeline_stages.probability` + `deals.probability` in DB, **nicht im UI** sichtbar |
| 2.9 | Vertriebsautomationen | ❌ 🔮 | Phase 2. `automations`-Tabelle als Hook angelegt |
| 2.10 | Ordner ↔ Pipeline synchronisieren | ✅ | Vertrieb-Ordner via „Mit Pipeline verbinden" 1:1 an Pipeline koppeln → Leads ↔ Deals beidseitig synchron (Hinzufügen/Löschen); Deal löschen = Lead löschen (voll gespiegelt). System-Spalte „Pipeline-Phase" (farbcodiertes Phasen-Dropdown, nicht editier-/löschbar). `lead_lists.pipeline_id` (1:1-Unique-Index), Engine in `src/lib/server/pipeline-sync.ts`. Verbinden befüllt nur Ordner→Pipeline. Hinweis: einzelner Deal-Löschen-Button ist im Pipeline-UI derzeit nicht verdrahtet |

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
| 9.1 | Mobile Optimierung | ✅ | Voll-Audit 2026-07-03: Burger-Menü + Nav-Drawer (vorher keine Navigation <768px), Unibox Master-Detail, Touch-Drag im Deal-Board (TouchSensor), iOS-Zoom-Fix (16px-Inputs), dvh statt vh, Touch-Ziele ≥36px, Modals mit Scroll |
| 9.1b | Installierbar (PWA) | ✅ | 2026-07-03: `manifest.webmanifest` (standalone) + App-Icons + Service Worker (`public/sw.js`) → „Zum Startbildschirm hinzufügen" / Installations-Button |
| 9.7 | Push-Benachrichtigungen | ✅ | 2026-07-03: `/einstellungen/benachrichtigungen` — Web-Push via VAPID, pro Gerät aktivierbar; Trigger: neuer Kontakt + Instantly-Reply. **Aktiv sobald `VAPID_*`-Env-Vars in Vercel gesetzt sind** (lokal in `.env.local` generiert) |
| 9.2 | Dunkelmodus | ✅ | `/einstellungen/darstellung` — Hell/Dunkel/System, Cookie-basiert ohne Flash; Token laufen über CSS-Variablen |
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

## 13. Zeiterfassung (außerhalb des PDF)

Nachträglich beauftragt, daher nicht Teil der ~84 PDF-Punkte und nicht in der Phase-1-Bilanz gezählt. Details: [`ZEITERFASSUNG_PLAN.md`](ZEITERFASSUNG_PLAN.md).

| # | Punkt | Status | Wo / Anmerkung |
|---|---|---|---|
| 13.1 | Mitarbeiterverwaltung | ✅ | `/zeiterfassung` — Mitarbeiter anlegen, aktiv/inaktiv. Tabelle `employees`, unique `(org_id, name)` |
| 13.2 | Gerätekopplung per Einladungslink | ✅ | Einmal-Link (7 Tage, nur SHA-256 in der DB) mit Gerätewahl und Installationsanleitung; die installierte App löst ihn beim ersten Start selbst ein → Geräte-Cookie `sk_zeit_geraet` (730 Tage). Tabellen `enrollment_tokens`, `employee_devices`; Geräte sperrbar |
| 13.11 | Eigene App für Mitarbeiter | ✅ | Zweites PWA-Manifest `public/zeit.webmanifest` („SK Zeit"), eigene Symbole, `scope: /zeit`; Installationsanleitung unter `/zeit` mit Android-Installationsknopf und iPhone-Anleitung |
| 13.3 | Stempeln per Handy | ✅ | `/zeit/stempel` — Ein-/Ausstempeln ohne Login, Identität = gekoppeltes Gerät (`requireDeviceEmployee()`). Doppeltes Einstempeln fängt ein partieller Unique-Index in der DB ab. Eigene Zeiten unter `/zeit/meine-zeiten`, dort auch „Gerät abmelden" |
| 13.4 | Live-Übersicht & Zeitenliste | ✅ | `/zeiterfassung` — wer ist eingestempelt, Einträge nach Tag/Woche/Monat (alle Berechnungen in Europe/Berlin über `src/lib/zeiterfassung.ts`) |
| 13.5 | Krankmeldungen | ✅ | Der Mitarbeiter meldet sich selbst krank (Push an Sascha). Fertige Einträge 08:00–16:00 je Kalendertag, belegte Tage werden übersprungen, max. 62 Tage pro Vorgang — und höchstens 14 Tage rückwirkend / 30 Tage im Voraus, damit niemand sich Stunden in abgerechnete Monate bucht |
| 13.6 | Zeitkorrekturen mit Protokoll | ✅ | Ändern und Nachtragen nur mit Begründung (≥ 5 Zeichen); **Löschen nur mit Bestätigung**, ohne Begründung (dort entstünden nur Platzhaltertexte). Jeder Vorgang landet in `time_edit_logs`, korrigierte Einträge werden markiert. Das Protokoll hängt am **Mitarbeiter** (nicht am Eintrag) und überlebt daher das Löschen einer Zeit — gelöschte Einträge stehen in einem eigenen Abschnitt (§ 16 Abs. 2 ArbZG: 2 Jahre Aufbewahrung) |
| 13.7 | CSV-Monatsexport | ✅ | Beginn/Ende auf die vorige Viertelstunde abgerundet, Dezimalstunden mit Komma, BOM + CRLF + Semikolon für Excel |
| 13.8 | Geofence / Standortprüfung | ❌ | **Bewusst gestrichen** (Berechtigungsdialoge, ungenaue Ortung, rechtlich heikel) — ebenso Außendienst-/Homeoffice-Kennzeichen |
| 13.9 | Urlaub, Pausen, Soll-/Überstunden, Löhne | ❌ 🔮 | Nicht im Umfang; Abrechnung läuft weiter außerhalb über den CSV-Export |
| 13.10 | Vergessenes Ausstempeln | ⚠️ | Wird **nicht** automatisch beendet — der Eintrag läuft weiter (bewusst, keine erfundenen Zeiten), fällt in der Übersicht auf und wird korrigiert |

---

## Tech-Debt & bekannte Verbesserungen

### 🐛 Sicherheit
- **Passwort-Gate verfügbar, aber noch NICHT aktiv.** Seit 2026-07-03 existiert eine Middleware (`src/middleware.ts` + `/zugang`), die die gesamte App hinter ein Passwort legt — sie greift, sobald in Vercel die Env-Variable `APP_PASSWORD` gesetzt und redeployt wird (Anleitung: `/einstellungen/sicherheit`). Bis dahin ist die App weiterhin komplett öffentlich (Login wurde 2026-06-05 entfernt, Vercel-Protection deaktiviert). Webhook- und Selftest-Endpunkte sind vom Gate ausgenommen (eigene Tokens).
- **`/zeit/*` ist bewusst vom Passwort-Gate ausgenommen** (Mitarbeiter kennen das `APP_PASSWORD` nicht) — Schutz ist stattdessen das Geräte-Cookie, das jede Seite und Action serverseitig prüft. ⚠️ Die Matcher-Ausnahme muss `zeit$|zeit/` lauten: ein bloßes `zeit` würde als Präfix auch den Admin-Bereich `/zeiterfassung` ungeschützt lassen.
- **✅ Behoben (2026-07-29): Server Actions liefen am Passwort-Gate vorbei.** Der Matcher enthielt `.*\..*`, um statische Dateien durchzulassen — das nahm aber *jeden* Pfad mit einem Punkt vom Gate aus. Weil Next.js Server Actions über den `Next-Action`-Header ausführt und nicht über den Pfad, war damit ein `POST /crm/a.b` (oder `/pipelines/a.b`, `/zeiterfassung/mitarbeiter/a.b`) mit gültigem Action-Header **ohne Anmeldung** möglich; betroffen waren 37 der 113 Actions, die Action-IDs stehen im ausgelieferten JS. Der Ausschluss listet jetzt konkrete Endungen und ist mit `$` verankert; gegen einen Produktions-Build per `curl` gegengeprüft (Punkt-Pfade → 307 auf `/zugang`). **Merke: keine ungeankerten Punkt-Muster im Matcher.**
- **Zweite Verteidigungslinie in der Zeiterfassung:** Alle Admin-Actions prüfen zusätzlich selbst (`requireAppZugang()` aus `src/lib/server/app-zugang.ts`), der CSV-Export ebenso. Grund: Ein Fehler im Matcher-Regex — oder ein vergessenes `APP_PASSWORD` auf einem Preview-Deployment — würde sonst sofort alle Arbeitszeiten freigeben. **`requireActiveOrg()` ist keine Autorisierung**, es liefert ohne Anmeldung immer die erste Org. Für die übrigen Sektionen (CRM, Pipelines, Postfach) steht diese zweite Prüfung noch aus.
- **Org-Auflösung ohne User:** `getActiveOrg()` nimmt die erste Org in der DB (optional `ACTIVE_ORG_ID`). Kein Request-bezogener Multi-Tenant-Schutz mehr; `assignee`/`author` werden nicht mehr gesetzt (null).
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
