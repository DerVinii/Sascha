# SalesSuite — Feature-Referenz & Nachbau-Spec

> **Zweck:** Sascha nutzt aktuell das CRM **SalesSuite** (salessuite.com, Anbieter SalesSuite CRM FlexCo, Graz). Die CRM-Sektion der SK-Kommandozentrale soll dieses Tool nachbauen. Dieses Dokument ist das konsolidierte Feature-Inventar (Web-Recherche, 22 Quellen) + Gap-Analyse gegen den aktuellen Stand. **Bauvorlage** — wird beim Bauen mitgepflegt.
>
> **Recherche-Stand:** 2026-06-27 · Quellen: salessuite.com (alle Funktionsseiten), app.salessuite.com, buy.salessuite.com, App-Store/Google-Play, 3 agenturmarkt.de-Reviews.

## Was ist SalesSuite?

Schlankes, vertriebsfokussiertes CRM, konsequent um das **Setter-Closer-Prinzip** gebaut. Zielgruppe: **Agenturen, Coaches, Berater, Dienstleister** mit systematischen (oft Kaltakquise-/Funnel-basierten) Vertriebsprozessen. Positionierung: „einfachstes CRM am Markt", Setup in 1–2 h. Kern-Differenzierer: **Power-Dialer** (echte Handy-Calls) + **Call-Flow-Tracking** + zentrales **KPI-Dashboard**.

Architektur-Grundprinzip: **Zwei Ebenen** — `Kontakte` (stabile Stammdaten) und `Deals` (konkrete Geschäftsmöglichkeiten, ein Kontakt kann mehrere parallele Deals haben). Deals wandern durch **mehrere parallele Pipelines** mit eigenen Phasen.

---

## Legende Gap-Status

| Symbol | Bedeutung im SK-CRM |
|---|---|
| ✅ | Vorhanden & nutzbar |
| 🟡 | Schema/Teil-UI da, unvollständig |
| 🗄️ | DB-Schema existiert, **kein UI** |
| ❌ | Fehlt komplett |
| 🚫 | Out-of-Scope (Team/Telefonie/Mobile/Billing — siehe unten) |

---

## 1. Kontakt- & Lead-Management

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Zwei-Ebenen-Struktur (Kontakte & Deals)** | Kontakt = stabile Stammdaten; Deal = Geschäftsmöglichkeit. 1 Kontakt → n Deals in versch. Phasen. | ✅ Deals als eigene Ebene; Deal-Kanban + Deals-Sektion auf Kontakt-Detail |
| **Einheitliche Detailansicht (3-Tab)** | Ein Klick → voller Kontext. Tabs: **Stammdaten · Aktivitäten · Notizen**, voll anpassbar. | 🟡 Detail-Page hat Stammdaten/Mail/Notizen/Aktivitäten als Sektionen (nicht Tabs, keine Deals) |
| **Custom Fields (Kontakt + Deal)** | Frei definierbare Felder, anpassbare Karten & Reihenfolge. | 🗄️ `customFields` JSONB da, kein UI |
| **Kontakt-Standardfelder** | Vorname, Nachname, E-Mail, mehrere Telefonnr., Firma, Adresse, Bundesland, Land, Branche, Rolle, Lead-Quelle. | 🟡 Basis-Felder da; `roleInCompany` da; mehrere Tel.-Nr. / Adresse-Struktur fehlen im UI |
| **Mehrere Ansprechpartner pro Firma** | Sortierreihenfolge, Haupt-Ansprechpartner. | ❌ |
| **CSV/Excel-Import mit Feld-Mapping** | Bulk-Import, Spalten→Felder-Mapping. | 🟡 CSV-Import existiert in `/vertrieb` (feste Spalten, kein Mapping-UI) |
| **Lead-Quellen-Trennung** | Kaltakquise vs. warm vs. Altbestand in separate Pipelines. | ❌ (single pipeline) |
| **Tracking-Felder** | „zuletzt erreicht am/von", Anrufanzahl, letzte Aktivität, Account-Owner. | 🟡 `lastContactAt` da; Rest fehlt |
| **Lead-Status-Werte** | Recherchiert, Geprüft, Ungeeignet, Kalt, Warm, Qualifiziert. | 🟡 6 Status (lead→won/lost), anders benannt |

## 2. Pipeline & Deals (Setter-Closer)

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Multi-Pipeline-System** | Beliebig viele parallele Pipelines, je eigene Phasen/Logik/Filter. Kanban + Drag-Drop. | ✅ Pipeline-Selector, mehrere Pipelines, eigene Phasen je Pipeline |
| **Anpassbare Deal-Phasen** | Phasen frei hinzufügen/löschen/umbenennen, Farben, Wahrscheinlichkeit. | ✅ Pipeline-Manager: anlegen/umbenennen/Farbe/%/Reihenfolge/löschen |
| **Setter-Closer-Rollen-Interface** | Eigene Workspaces Opener→Setter→Closer, Handoff-Tracking. | ❌ (single-user) |
| **Pipeline-Vorlagen** | Cold-Calling, Setter-Closer, Upsell, Reaktivierung, Training. | ✅ 5 Vorlagen (Standard, Kaltakquise, Setter-Closer, Upsell, Leer) |
| **Deal-Tracking & Phasen-Conversion** | Wert, Anrufanzahl, Abschlussdatum, Closed-Won/Lost mit Grund, Conversion-Messung. | 🟡 Wert/Abschlussdatum/Phasen-% + Summen da; Conversion-Messung & Verlust-Grund später |
| **Drag-Drop Deals im Kanban** | Deals zwischen Phasen ziehen. | ✅ Echte Deals, optimistisch + Rollback bei Fehler |
| **Ziele/Targets pro Pipeline** | Ziele für Calls, Termin-Conversion, Abschlüsse. | ❌ |

## 3. Power Dialer & Telefonie 🚫

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Power-Dialer** | Wählt nächsten Deal automatisch, Fließband-Modus, 2,4× mehr Calls. | 🚫 braucht Telefonie-Integration + Smartphone-App |
| **Smartphone-/Softphone-Anbindung** | Echte Handy-Calls / Aircall. | 🚫 |
| **Listen-Vorfilterung für Dialer** | Segmentieren vor dem Wählen. | 🚫 (Filter-Teil siehe §9) |

## 4. Call-Flow-Tracking & Anrufdokumentation

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Automatisches Call-Logging** | Jeder Call wird am Kontakt/Deal protokolliert (Datum, Dauer, Ergebnis). | ❌ (manuell als Activity-Typ `call` möglich) |
| **Strukturierte Call-Typen** | Opening/Setting/Closing/Follow-up, konfigurierbar. | ❌ |
| **Gatekeeper-/Entscheider-Logik** | Geführter Call-Flow, Ergebnis-Status. | ❌ |
| **Call-Timeline** | Chronologische Calls/Mails/Notizen am Kontakt/Deal. | 🟡 Aktivitäten-Sektion da |
| **Call-Aktionen (Pin, Follow-up)** | Pinnen, 1-Klick-Folgeaufgabe. | ❌ |

> **Hinweis:** Manuelles Call-Flow-Tracking (ohne echten Dialer) ist auch single-user wertvoll für einen Coach mit Kaltakquise — baubar ohne Telefonie-API.

## 5. E-Mail & Postfach

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Integrierter E-Mail-Versand** | Senden aus CRM, Gmail/Outlook/SMTP, mehrere Postfächer. | 🟡 `/postfach`-Reiter existiert (Stand prüfen); `email_threads/messages` da (read-only) |
| **E-Mail-Vorlagen mit Variablen** | Wiederverwendbar, Platzhalter, Ordner. | 🟡 „Variable einfügen" existiert im Kampagnen-Assistenten (Vertrieb/Instantly) |
| **E-Mail-Signaturen** | Mehrere, Standard. | ❌ |

> Vertrieb-Seite nutzt bereits **Instantly** für Mail-Kampagnen — überschneidet sich teils.

## 6. Lead-Formulare / Lead-Capture

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **No-Code Formular-Builder** | Felder per Drag-Drop, Submission → Kontakt+Deal in Pipeline. | ❌ |
| **Formular-Einbettung (Website)** | Embed-Code. | ❌ |
| **Formular-Statistiken** | Ausfüllraten. | ❌ |

## 7. Aufgaben, Aktivitäten & Notizen

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Aktivitäts-Logging (Timeline)** | Calls/Mails/Notizen automatisch verknüpft. | 🟡 `/aufgaben` + Activities da |
| **Notizen (pin, team-sync)** | Pro Kontakt/Deal, anpinnbar. | ✅ Notizen pro Kontakt (kein Pin/Deal) |
| **Aufgaben/Follow-ups/Wiedervorlagen** | 1-Klick aus Call, Reminder, „heute fällig". | ✅ `/aufgaben` (5 Typen, fällig/überfällig) |
| **Termin-/Aktivitätsverwaltung** | + Kalender-Sync. | 🟡 `/kalender`-Reiter existiert |

## 8. Kalender

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Kalender-Sync & Terminbuchung** | Google/Outlook/Calendly, Buchung → Kontakt+Deal. | 🟡 `/kalender`-Reiter da (Stand prüfen); Sync ❌ |

## 9. Filter & Ansichten

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Intelligentes Filter-System** | Multi-Kriterien (Branche, Status, Aktivität, Custom Fields), OR-Gruppen, priorisiert unerreichte Kontakte. | 🟡 nur Status-Filter-Buttons |
| **KI-Filter (natürl. Sprache)** | Filter aus Text generieren. | ❌ (KI-Spalten existieren im Scraping) |
| **Gespeicherte Ansichten & Spalten** | Benannte Views, konfigurierbare Spalten, Karten-Ansicht. | 🟡 Scraping-Table hat Spalten-Config; CRM nicht |

## 10. Dashboard, Reporting & KPIs

| SalesSuite-Feature | Was es tut | SK-CRM |
|---|---|---|
| **Zentrales KPI-Dashboard** | Anrufversuche, Erreichbarkeit, Setting-/Closing-Rate, Pipeline-Health, live. | 🟡 `/dashboard` mit 5 KPIs + 2 Widgets (keine Call-KPIs) |
| **Mitarbeiter-Performance** | Leaderboard, Vergleich. | 🚫 (single-user) |
| **Datenvisualisierung** | Charts statt Tabellen. | ❌ |
| **Flexible Berichte** | Zeiträume, Metrik-Kombis, speicherbar. | ❌ |
| **Stündliche Auswertung** | Tagesverlauf, „Mittagsloch erkannt". | ❌ |
| **KPI-Benchmarks/Schwellen** | Team-Standards, Threshold-Monitoring. | ❌ |
| **Abwesenheits-Management** | KPI-Korrektur, Personio-Sync. | 🚫 |

## 11. Team, Rollen & Echtzeit 🚫

| SalesSuite-Feature | SK-CRM |
|---|---|
| Echtzeit-Kollaboration, Kontakt-Locking, Live-Präsenz | 🚫 single-user, kein Login |
| Rollenbasierte Rechte (Opener/Setter/Closer/Manager) | 🚫 |
| Benutzerverwaltung | 🚫 |

> Schema ist multi-tenant-fähig (`org_id` überall), aber App läuft bewusst ohne Login/Team.

## 12. Automationen & Integrationen

| SalesSuite-Feature | SK-CRM |
|---|---|
| **Zapier / n8n / offene API** | ❌ (`automations`-Tabelle als Hook da) |
| **100+ native Integrationen** | 🟡 Instantly (Mail), Google Places (Scraping), Gemini (KI-Spalten) vorhanden |
| **Workflow-Automationen** | ❌ |
| **Action-Button (In-CRM-Trigger)** | ❌ |

## 13. Mobile 🚫 · 14. Onboarding · 15. Admin · 16. Billing

| | SK-CRM |
|---|---|
| Native Mobile-App (iOS/Android) | 🚫 (Web ist responsive) |
| Trainings-/Schulungsplattform (LearningSuite) | 🚫 |
| Call-Typ-Config, Mehrsprachigkeit, Limit-Verwaltung | ❌/🚫 |
| Pläne/Preise/Billing | 🚫 (irrelevant) |

---

## Gap-Zusammenfassung & empfohlener Bau-Scope

**Bereits da (Fundament steht):** Kontakte-CRUD, Detail-Page, Notizen, Aufgaben, einfache Pipeline-Kanban, CSV-Export, Dashboard-Basis. **DB-Schema für Deals/Pipelines/Stages/Activities existiert vollständig** — größte Lücke ist UI.

**Kern-Nachbau CRM (single-user-sinnvoll, ohne externe Dienste):**
1. ✅ **Deals als eigene Ebene** + Multi-Pipeline-Verwaltung (Pipelines/Phasen anlegen, Farben, Wahrscheinlichkeit) — *fertig 2026-06-28*
2. ✅ **Deal-Kanban** mit Drag-Drop von Deals (statt Kontakt-Status), pro Pipeline — *fertig 2026-06-28*
3. **Einheitliche 3-Tab-Detailansicht** (Stammdaten · Aktivitäten · Notizen) für Kontakt & Deal ← *als Nächstes*
4. **Custom-Fields-UI** (Kontakt + Deal)
5. **Call-Flow-Tracking** (Call-Typen, Ergebnis, Gatekeeper/Entscheider, Timeline, 1-Klick-Follow-up)
6. **Intelligentes Filter-System** + gespeicherte Ansichten + Spalten-Config
7. **Pipeline-Vorlagen** (Cold-Calling, Setter-Closer, Upsell …)
8. **CRM-KPI-Dashboard** (Call-Flow-Kennzahlen, Pipeline-Health, Conversion)
9. **Lead-Formulare** (No-Code-Builder + Embed) — optional
10. **E-Mail-Versand aus CRM** (SMTP) — optional, überschneidet sich mit Instantly

**Bewusst Out-of-Scope (🚫):** Power-Dialer/echte Telefonie, native Mobile-App, Team/Rollen/Echtzeit-Kollaboration, Personio/Abwesenheit, Billing, LearningSuite-Schulung. → nur sinnvoll mit Team, Telefonie-API bzw. Login.
