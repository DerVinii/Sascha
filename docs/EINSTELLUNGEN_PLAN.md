# Einstellungen — Ausbauplan

> **Stand:** 2026-07-03 · Ersetzt den verlorenen Plan aus der gelöschten Vorsession.
> Der Reiter existiert bisher nur als Platzhalter ([src/app/(app)/einstellungen/page.tsx](../src/app/(app)/einstellungen/page.tsx), „Phase 1 — kommt: Organisation, Team, Integrationen").
> Der „Einstellungen"-Button oben in **Kontakte** verlinkt bereits hierher.

---

## Grundsätze

1. **Single-User, kein Login.** Die App läuft ohne Auth auf einer festen Org. Es gibt also kein „Profil" und keine Team-Verwaltung — Einstellungen sind immer **Org-Einstellungen**.
2. **Kein Schema-Umbau nötig für Phase 1.** `organizations.settings` (JSONB) existiert und wird bereits für `leadViews` (Scraping-Ansichten) genutzt. Neue Einstellungen kommen als weitere Keys dazu (`contactFields`, `general`, …). Die `tags`-Tabelle existiert ebenfalls schon.
3. **API-Keys bleiben in Vercel-Env-Variablen.** Solange die App öffentlich ohne Login läuft, werden Keys **nicht** über das UI editierbar gemacht (jeder Besucher könnte sie sonst ändern/auslesen). Das UI zeigt nur den **Status** der Integrationen.
4. **SalesSuite-Vorbild:** Das wichtigste Einstellungs-Feature in SalesSuite sind die **individuellen Kontaktfelder** (Custom Fields) — genau dahin führt dort der „Einstellungen"-Button aus der Kontaktliste.

---

## Zielbild: Aufbau des Reiters

`/einstellungen` bekommt eine **Unternavigation** (linke Leiste auf Desktop, horizontale Tabs auf Mobile) mit eigenen Routen pro Bereich:

```
/einstellungen                → leitet auf /einstellungen/organisation
/einstellungen/organisation   → Name, Region/Format, Kennzahlen
/einstellungen/kontaktfelder  → Custom Fields für Kontakte (SalesSuite-Kernstück)
/einstellungen/tags           → Tag-Verwaltung (Name + Farbe)
/einstellungen/integrationen  → Statuskarten Instantly / Google Places / Gemini
/einstellungen/daten          → Exporte, Import-Verweis, (später) Dubletten
/einstellungen/darstellung    → Dunkelmodus (hell / dunkel / System)
/einstellungen/sicherheit     → Zugriffsschutz-Status (Passwort-Gate)
```

Technik: `einstellungen/layout.tsx` (Unternav) + eine Route pro Bereich, `actions.ts` mit org-gescopten Server-Actions, Styling wie überall (`rounded-xl border-line bg-surface`). Der Header-Titel funktioniert per Prefix-Matching bereits für alle Unterrouten.

---

## Die Bereiche im Detail

### 1. Organisation
- **Org-Name bearbeiten** (steht in `organizations.name`, aktuell nirgends änderbar).
- **Regionales Format** (informativ/konfigurierbar): Währung EUR, Datumsformat de-DE.
- **Kennzahlen-Karte:** Anzahl Kontakte / Firmen / Deals / Pipelines, DB-Projekt, Live-URL.
- Speicher: `organizations.name` + `organizations.settings.general`.

### 2. Kontaktfelder (Custom Fields) — das SalesSuite-Kernstück
Schließt die größte bekannte Lücke (STATUS 1.11: JSONB-Spalte da, kein UI).
- **Felddefinitionen verwalten:** anlegen / umbenennen / löschen / Reihenfolge (Drag oder Pfeile).
- **Feldtypen:** Text, Zahl, Datum, Auswahl (Select mit Optionen), Checkbox, URL, Telefon.
- **Pro Feld:** Label, Typ, Optionen (bei Select), „in Kontakttabelle anzeigen" (Spalten-Toggle).
- **Wirkung im CRM:**
  - Kontakt-Detail (`/crm/[id]`): Custom-Felder als editierbare Sektion unter den Stammdaten.
  - Kontakte-Tabelle (`/crm`): markierte Felder erscheinen als zusätzliche Spalten.
- Speicher: Definitionen in `organizations.settings.contactFields` (Array: `{key, label, type, options?, position, showInTable}`), Werte wie gehabt in `contacts.custom_fields` (JSONB). **Keine Migration nötig.**
- Der „Einstellungen"-Button in Kontakte verlinkt direkt hierher.

### 3. Tags
- CRUD für Tags (Name + Farbe) auf Basis der vorhandenen `tags`-Tabelle.
- Wirkung: Tag-Zuweisung am Kontakt (Detail-Seite) + Tag-Filter in der Kontaktliste (Folgeausbau).

### 4. Integrationen (Status, read-only)
- **Statuskarten** für die drei angebundenen Dienste:
  - **Instantly** (Cold-Outreach): Key vorhanden? Test-Call ok?
  - **Google Places** (Lead-Scraping): dito
  - **Gemini** (KI-Anreicherung): dito + konfiguriertes Modell
- „Verbindung testen"-Button je Karte (Server-Action macht einen Mini-API-Call).
- Hinweistext: Keys werden über Vercel-Env verwaltet (`INSTANTLY_API_KEY`, `GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY`).
- **Bewusst nicht:** Keys im UI ändern — erst nach Zugriffsschutz sinnvoll.

### 5. Daten
- **Exporte:** Kontakte-CSV (existiert: `/api/crm/export`), zusätzlich Firmen- und Deals-Export (gleicher Route-Stil, UTF-8-BOM für Excel).
- **Import-Verweis:** Link auf den CSV-Import in `/vertrieb`.
- **Später (Phase B):** Dubletten-Scan (gleiche E-Mail / gleicher Firmenname) mit Merge-UI.

### 6. Darstellung
- **Dunkelmodus:** hell / dunkel / System. Umsetzung über CSS-Variablen der bestehenden Tailwind-Tokens + `.dark`-Klasse; Persistenz per Cookie (SSR-sicher, kein Aufblitzen). Erledigt STATUS 9.2.

### 7. Sicherheit / Zugriffsschutz
Größter offener Tech-Debt-Punkt: **Die App ist komplett öffentlich** (echte Kontaktdaten!).
- **Einfaches Passwort-Gate:** Next.js-Middleware prüft ein signiertes Cookie; ohne Cookie → Passwortseite. Passwort als `APP_PASSWORD` in Vercel-Env.
- Die Einstellungs-Seite zeigt: Schutz aktiv/inaktiv + Anleitung.
- Kein „richtiges" Auth-System (bewusst) — nur eine Tür vor der App. Empfehlung: **früh umsetzen.**

---

## Phase B (braucht externe Dienste / Credentials — separat planen)

| Bereich | Inhalt | Voraussetzung |
|---|---|---|
| **E-Mail-Konten** | Postfach-Anbindung (Instantly-Unibox und/oder Microsoft Graph) — Grundlage für den Reiter „Postfach". Recherche aus Vorsession liegt vor. | API-Keys / Azure-App-Registrierung |
| **Kalender-Sync** | Google/Outlook-Kalender — Grundlage für den Reiter „Kalender" | OAuth-Credentials |
| **Benachrichtigungen** | E-Mail-Erinnerungen für fällige Follow-ups | Cron + Mail-Versandweg |
| **API-Key-Verwaltung im UI** | Keys in DB statt Env | Zugriffsschutz muss vorher stehen |
| **Dubletten-Merge** | Scan + Zusammenführen | — |

**Bewusst nicht geplant** (single-user, kein Login): Team & Rollen, Benutzer-Profile, Rechteverwaltung, Billing. Schema-Hooks (`org_members`, `org_invites`, `org_role`-Enum) liegen bereit, falls sich das ändert.

---

## Umsetzungsreihenfolge (Phase A)

| # | Paket | Inhalt | Aufwand |
|---|---|---|---|
| 1 | **Shell + Organisation + Integrationen + Daten** | Unternav-Layout, Org-Name-Edit, Statuskarten mit Test-Buttons, Export-Bereich | ~4–6 h |
| 2 | **Kontaktfelder** | Definitions-UI + Anzeige in Kontakt-Detail + Tabellen-Spalten | ~8–12 h |
| 3 | **Tags** | CRUD + Zuweisung am Kontakt | ~3–4 h |
| 4 | **Zugriffsschutz** | Middleware + Passwortseite + Sicherheits-Bereich | ~3–4 h |
| 5 | **Dunkelmodus** | Token-Umbau auf CSS-Variablen + Toggle | ~6 h |

Jedes Paket ist eigenständig deploybar (ein Push pro Paket). Reihenfolge 2↔4 tauschbar — Zugriffsschutz zuerst, wenn die öffentlichen Echtdaten drängen.
