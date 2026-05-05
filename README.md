# Sascha – SK Kommandozentrale (UI-Prototyp)

Klickbarer UI-Prototyp für die geplante Custom-App von **SK – Dozent und Coach**.
Eine einzige HTML-Datei, kein Build-Schritt nötig.

## Anschauen

Datei [`prototype/index.html`](prototype/index.html) im Browser öffnen — das war's.

## Inhalt

- **Login** → Klick auf „Anmelden" → Dashboard
- **Dashboard** mit KPI-Kacheln und zwei Live-Widgets
- **Vertrieb** — Kampagnen-Tabelle, 3-Schritt-Wizard für neue Kampagne, Clay-Style Live-Lead-Tabelle mit animierter Pipeline
- **Sichtbarkeit** — Content-Kalender (Mai 2026) mit Status-Farben pro Tag, Klick öffnet Plattform-Tabs
- **CRM** — Kontakte-Tabelle, Kanban-Pipeline, Kontakt-Sheet mit Mail-Historie
- **Einstellungen** — Organisation, Team, Integrationen

## Quelle

Die Kundenanfrage, auf der das Konzept basiert, liegt in [`Kundenanfrage.txt`](Kundenanfrage.txt).

## Tech

Reine statische Datei — Tailwind via CDN, lucide-Icons inline, vanilla JS. Keine Dependencies, kein `node_modules`, keine Build-Tools.
