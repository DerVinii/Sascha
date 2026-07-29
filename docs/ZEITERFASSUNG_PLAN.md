# Zeiterfassung: Architektur & Entscheidungen

> Stand: 2026-07-29 · Status: **fertig** — Mitarbeiter- und Admin-Bereich, CSV-Export und Navigation stehen, Migration ist gelaufen, Build grün.
> Herkunft: portiert aus einem bestehenden Zeiterfassungs-System eines anderen Kunden (Next 14 + Prisma). Übernommen wurde **nur die Fachlogik** — Stack, Datenzugriff und Design folgen komplett diesem Projekt.

## 1. Ziel

Sascha braucht eine Zeiterfassung für seine Mitarbeiter. Die Mitarbeiter stempeln per Handy — kein Terminal, keine App-Installation, keine Zugangsdaten, die sie sich merken müssen. Das Handy wird **einmalig per QR-Code gekoppelt** und ist danach dauerhaft als „dieses Gerät gehört Person X" bekannt.

Sascha selbst sieht in der Kommandozentrale, wer gerade eingestempelt ist, korrigiert vergessene oder falsche Zeiten, trägt Krankmeldungen ein, verwaltet Mitarbeiter und Geräte und exportiert Monatsabrechnungen als CSV.

## 2. Routen-Architektur — und warum sie so ist

| Bereich | Routen | Wer | Schutz |
|---|---|---|---|
| **Admin** | `/zeiterfassung*` | Sascha | APP_PASSWORD-Gate der Middleware (wie der Rest der App), im `(app)`-Layout mit Sidebar/Header |
| **Mitarbeiter** | `/zeit`, `/zeit/*` | Team | **bewusst vom Gate ausgenommen** — dafür Geräte-Cookie `sk_zeit_geraet`, serverseitig geprüft |

Der Grund für die Trennung: Die Mitarbeiter kennen das APP_PASSWORD nicht und sollen es nie erfahren — es öffnet die komplette Kommandozentrale mit allen Kontakt- und Vertriebsdaten. Ein zweites Passwort nur für die Zeiterfassung wäre wieder etwas, das man vergisst, weitergibt oder aufschreibt. Stattdessen ist **das gekoppelte Gerät der Ausweis**: Wer den QR-Code einmal gescannt hat, ist danach identifiziert.

Der Mitarbeiterbereich ist deshalb ohne Passwort erreichbar, aber **nicht ungeschützt**: Jede `/zeit`-Seite und jede zugehörige Server-Action ruft `requireDeviceEmployee()` aus `src/lib/server/zeiterfassung/auth.ts` auf. Ohne gültiges Gerät gibt es keine Daten und keine Mutation — Schutz liegt in der Anwendung, nicht in der Middleware.

Mitarbeiter-Seiten:

```
/zeit                  → leitet weiter auf /zeit/stempel
/zeit/stempel          → Stempeluhr (Einstempeln / Ausstempeln, laufende Zeit, Krankmeldung)
/zeit/enroll/[token]   → Ziel des QR-Codes: Einmal-Token einlösen, Gerät registrieren
/zeit/meine-zeiten     → eigene Einträge, Monatsnavigation, Gerät abmelden
```

Admin-Seiten: `/zeiterfassung` (Live-Übersicht), `/zeiterfassung/mitarbeiter` (Liste, Monatsexport), `/zeiterfassung/mitarbeiter/[id]` (QR-Kopplung, Geräte, Zeiten, Korrekturen).

### 2.1 Zwei Fallstricke in der Middleware

**Erstens: die Ausnahme muss `zeit$|zeit/` lauten.** Ein bloßes `zeit` wirkt im Regex als Präfix und würde auch `/zeiterfassung` treffen — der komplette Admin-Bereich mit allen Mitarbeiterdaten stünde dann ohne Passwort offen.

**Zweitens: keine ungeankerten Punkt-Ausschlüsse.** Der Matcher enthielt ursprünglich `.*\..*`, um statische Dateien durchzulassen. Das nahm jedoch *jeden* Pfad mit einem Punkt vom Gate aus — und weil Next.js Server Actions über den `Next-Action`-Header ausführt und nicht über den Pfad, ließ sich damit jede Action einer dynamischen Route ohne Anmeldung aufrufen: Ein `POST /crm/a.b` mit gültigem Action-Header lief durch. Betroffen waren nicht nur die Zeiterfassung, sondern auch CRM und Pipelines. Der Ausschluss listet deshalb jetzt konkrete Endungen und ist mit `$` ans Pfadende verankert.

Wer `src/middleware.ts` anfasst, prüft danach beides — am besten mit einem kurzen Regex-Durchlauf über `/zeiterfassung`, `/crm/a.b`, `/zeit/stempel` und `/icon-192.png`.

### 2.2 Die Middleware ist nicht die einzige Verteidigungslinie

Weil ein Fehler in genau diesem Regex schlagartig alle Personendaten freigibt, prüfen die schützenswerten Stellen zusätzlich selbst: Alle neun Server Actions in `src/app/(app)/zeiterfassung/actions.ts` beginnen mit `requireAppZugang()`, die CSV-Route mit `hatAppZugang()` (beide aus `src/lib/server/app-zugang.ts`, sie vergleichen das `sk_zugang`-Cookie gegen `APP_PASSWORD`).

Wichtig zu wissen: **`requireActiveOrg()` ist keine Autorisierung.** Ohne Anmeldung liefert es immer die erste Organisation zurück — es begrenzt den Datenraum, prüft aber nicht, wer fragt.

`/api/*` bleibt vollständig hinter dem Gate (ohne Cookie → 401). Die Zeiterfassung braucht keine offenen API-Routen: Alles läuft über Server Actions, API-Routen gibt es nur für den CSV-Download.

## 3. Datenmodell

Fünf neue Tabellen in `src/db/schema.ts`, alle org-scoped (`orgId` in **jeder** Query):

| Tabelle | Zweck |
|---|---|
| `employees` | Die Mitarbeiter — Name, aktiv/inaktiv. Unique `(orgId, name)`, damit derselbe Name nicht doppelt angelegt wird. |
| `employee_devices` | Die gekoppelten Handys. Enthält nur `tokenLookup` (SHA-256 des Geräte-Tokens), dazu Label, User-Agent, Kopplungszeitpunkt, `lastSeenAt` und `revoked` zum Sperren eines verlorenen Geräts. |
| `enrollment_tokens` | Einmal-Tokens für die Kopplung: gehören zu einem Mitarbeiter, laufen ab (`expiresAt`) und werden beim Einlösen als `consumed` markiert. |
| `time_entries` | Die eigentlichen Stempelzeiten: `clockIn`, `clockOut` (**null = läuft gerade**), `sick` für Krankheitstage, `wasEdited` als Marker für korrigierte Einträge. |
| `time_edit_logs` | Änderungsprotokoll je Korrektur: welches Feld (`created` / `clockIn` / `clockOut` / `deleted`), alter und neuer Wert, Begründung, Zeitpunkt. |

**Der wichtigste Index**: ein *partieller* Unique-Index auf `time_entries.employee_id WHERE clock_out IS NULL`. Er erzwingt auf Datenbankebene, dass pro Mitarbeiter höchstens **ein** laufender Eintrag existiert. Doppeltes Einstempeln — zwei Tabs, Doppeltipp, wackeliges Mobilfunknetz — ist damit kein Anwendungsfall mehr, den die UI abfangen muss, sondern ein Constraint-Fehler.

**Das Protokoll hängt am Mitarbeiter, nicht am Eintrag.** `time_edit_logs.time_entry_id` ist nullable mit `ON DELETE SET NULL`; die Verbindung zum Mitarbeiter läuft über ein eigenes `employee_id` (mit `CASCADE`). Anfangs hing das Protokoll per `CASCADE` am Eintrag — dann nahm aber das Löschen einer korrigierten Zeit den Beleg für die Korrektur gleich mit, und von einer nachträglich geänderten und dann gelöschten Zeit blieb keinerlei Spur. Arbeitszeitnachweise sind nach § 16 Abs. 2 ArbZG zwei Jahre aufzubewahren, also überlebt der Protokolleintrag jetzt den Zeiteintrag und trägt in `entry_clock_in` / `entry_clock_out` eine Kopie der Eckwerte, damit er ohne den gelöschten Datensatz lesbar bleibt.

Das Löschen eines **Mitarbeiters** räumt dagegen weiterhin alles ab, Protokolle eingeschlossen — das ist für ein Löschersuchen nach DSGVO das gewünschte Verhalten, und die Oberfläche warnt vor genau dieser Konsequenz.

### 3.1 Zeitrechnung

Alle Berechnungen laufen über `src/lib/zeiterfassung.ts` (Europe/Berlin, client- und servertauglich). **Niemals `src/lib/kalender.ts` für Zeiterfassungs-Rechnungen benutzen** — das rechnet in Prozess-Lokalzeit, und der Server läuft UTC. Tagesgrenzen, Wochen (Montag-Start), Monate und Dauern kommen ausschließlich aus der Zeiterfassungs-Bibliothek.

Für die Umrechnung „Berliner Lokalzeit → UTC-Zeitpunkt" wird `fromZonedTime` aus `date-fns-tz` benutzt. Eine selbstgebaute Offset-Rechnung (Lokalzeit als UTC lesen, Offset an diesem Zeitpunkt bestimmen, abziehen) sieht richtig aus, liegt aber an den beiden Umstellungstagen für Uhrzeiten zwischen 01:00 und 01:59 genau eine Stunde daneben — bei einer Zeiterfassung eine falsch abgerechnete Stunde. `npm run pruefe:zeiterfassung` prüft unter anderem alle 192 Viertelstunden beider Umstellungstage.

### 3.2 Wem gehören die Stunden? (zwei Sichtweisen, bewusst getrennt)

- **Kacheln „Heute" / „Diese Woche" und die Admin-Übersicht** beantworten *„wie viel wurde in diesem Fenster gearbeitet"*. Sie **klemmen** deshalb auf das Fenster (`totalMinutesInWindow`); ein laufender Eintrag zählt nur bis jetzt. Eine Nachtschicht von Montag 22:00 bis Dienstag 06:00 steuert am Dienstag also 6 Stunden zur Tageskachel bei.
- **Monatstabellen und CSV** sind Abrechnungsansichten. Dort gilt: **ein Eintrag gehört vollständig zu dem Monat, in dem er begonnen hat**, und die Monatssumme ist schlicht die Summe der angezeigten Zeilen — kein Klemmen. Nur so stimmen Zeile, Fußzeile und CSV überein; vorher zeigte dieselbe Nachtschicht über den Monatswechsel in der Zeile 8:00 h und in der Fußzeile 2:00 h.

Wer hier etwas ändert, muss beide Sichten zusammen betrachten, sonst driften Anzeige und Export wieder auseinander.

## 4. Ablauf der Geräte-Kopplung

1. Sascha legt den Mitarbeiter unter `/zeiterfassung` an und erzeugt einen **Kopplungs-Code**.
2. Die App generiert ein 32-Byte-Zufallstoken (`generateToken()`). In der DB landet **nur der SHA-256-Hash** (`tokenLookup`) — der Klartext existiert ausschließlich im QR-Code. Ein Datenbankleck gibt niemandem Zugang.
3. Das Token ist **24 Stunden** gültig und **einmal** einlösbar (`consumed`). Der QR-Code zeigt auf die Kopplungs-Seite mit dem Token im Link.
4. Der Mitarbeiter scannt mit der Handy-Kamera. Die Seite prüft das Token (nicht abgelaufen, nicht verbraucht, richtige Org), markiert es als verbraucht, legt ein `employee_devices`-Gerät an — wieder nur mit dem Hash — und setzt das Cookie `sk_zeit_geraet` (HttpOnly, `secure`, `sameSite: lax`).
5. Cookie-Laufzeit: **730 Tage**. Das Handy bleibt gekoppelt, bis es gesperrt wird oder der Nutzer Browserdaten löscht. Bei jedem Zugriff wird `lastSeenAt` aktualisiert; ein gesperrtes (`revoked`) Gerät fällt sofort raus.

Verlorenes Handy = Gerät in der Admin-Ansicht sperren, neuen QR-Code erzeugen. Alter Zugang tot, kein Passwortwechsel für alle nötig. Der Mitarbeiter kann sein Gerät außerdem selbst abmelden (unter „Meine Zeiten") — praktisch beim Handywechsel oder wenn ein Diensthandy zurückgegeben wird.

Die Option „Bereits eingerichtete Geräte abmelden" beim Erzeugen eines neuen Codes ist **standardmäßig aus** und fragt vor dem Ausführen nach. Sie war zunächst vorbelegt, sperrt aber das laufende Handy in dem Moment, in dem der neue Code erzeugt wird — wird er dann nicht sofort gescannt, steht der Mitarbeiter ohne Stempelmöglichkeit da.

## 5. Fachliche Regeln

**Krankmeldung.** Der **Mitarbeiter selbst** meldet sich auf dem Handy für einen Zeitraum krank (Sascha bekommt eine Push-Nachricht, sofern Push eingerichtet ist). Für jeden Kalendertag darin entsteht ein **fertiger** Eintrag von **08:00 bis 16:00** mit `sick = true` — kein laufender Eintrag, nichts zum Ausstempeln. Tage, an denen schon ein Eintrag existiert, werden **übersprungen** statt überschrieben: eine versehentlich zu breit gewählte Krankheitswoche zerstört keine echten Stempelzeiten. Maximal **62 Tage** pro Vorgang, damit ein Tippfehler im Datum nicht Tausende Zeilen erzeugt.

Weil hier jemand seine *eigenen* Arbeitszeiten schreibt, ist das Fenster zusätzlich begrenzt: höchstens **14 Tage rückwirkend** und **30 Tage im Voraus**. Ohne diese Grenze könnte sich ein Mitarbeiter selbst 8-Stunden-Tage in bereits abgerechnete Vormonate buchen. Für ältere Zeiträume trägt Sascha die Zeit von Hand nach — mit Begründung und Protokolleintrag. Jeder selbst gemeldete Krank-Tag erzeugt außerdem eine Protokollzeile mit dem Grund „Selbst-Krankmeldung", damit im Nachhinein erkennbar bleibt, woher der Eintrag stammt.

**Zeitkorrekturen.** Sascha kann Beginn und Ende ändern, Einträge nachträglich anlegen und löschen — aber **nur mit Begründung** (mindestens 5 Zeichen), auch beim Löschen. Jede Änderung schreibt eine Zeile nach `time_edit_logs` (Feld, alter Wert, neuer Wert, Grund), der Eintrag bekommt `wasEdited = true` und ist in der Übersicht als korrigiert erkennbar. Gelöschte Einträge erscheinen auf der Mitarbeiterseite in einem eigenen Abschnitt „Gelöschte Einträge" — ein Protokoll, das niemand sehen kann, nützt im Streitfall wenig.

**CSV-Export.** Der Monatsexport rundet **Beginn und Ende jeweils auf die vorige Viertelstunde ab** (`floorQuarter`) — die gelebte Abrechnungspraxis aus dem Ursprungssystem. Die Datei kommt mit BOM, CRLF und Semikolon-Trenner (`buildCsv`), damit Excel sie ohne Import-Dialog korrekt öffnet; Dezimalstunden mit Komma (`hoursDecimal`).

## 6. Bewusst NICHT gebaut

- **Geofence / Standortabfrage.** Im Ursprungssystem vorhanden, hier gestrichen: Berechtigungsdialoge auf jedem Handy, ungenaue Ortung in Gebäuden, dauernd Support-Fälle — und rechtlich der heikelste Teil einer Zeiterfassung. Vertrauen plus Änderungsprotokoll reicht für ein Team dieser Größe.
- **Außendienst-/Homeoffice-Kennzeichen.** Existierte nur, um Stempelungen außerhalb des Geofence zu erlauben. Ohne Geofence sinnlos.
- **Urlaubsverwaltung, Pausenerfassung, Soll-/Ist-Vergleich, Überstundenkonten, Stundenlöhne und Lohnsummen.** Alles eigene Fachgebiete mit eigenen Regeln; die Zeiterfassung liefert die Rohdaten als CSV, die Abrechnung passiert weiterhin außerhalb.
- **Automatisches Beenden vergessener Stempelungen.** Wer abends nicht ausstempelt, dessen Eintrag **läuft weiter** — auch über Nacht und übers Wochenende. Bewusst so: Ein automatischer Feierabend um 18:00 wäre eine erfundene Zahl in einem Dokument, das im Zweifel arbeitsrechtlich zählt. Stattdessen fällt der Dauerläufer in der Admin-Übersicht auf und Sascha korrigiert ihn — mit Begründung und Protokolleintrag.

## 7. Betrieb

- **Migration**: `npx tsx scripts/migrate-zeiterfassung.ts` (legt die fünf Tabellen inkl. partiellem Unique-Index an, idempotent — zieht auch die spätere Umstellung des Protokolls nach). Ist bereits gelaufen.
- **Prüfung der Zeitrechnung**: `npm run pruefe:zeiterfassung` — läuft mit `TZ=UTC` wie auf Vercel und prüft Umstellungstage, Nachtschichten, Monatsgrenzen, die Viertelstunden-Rundung und ungültige `?monat=`-Parameter. Nach jeder Änderung an `src/lib/zeiterfassung.ts` ausführen.
- **Env `NEXT_PUBLIC_APP_URL`**: Basis-URL für den Link im QR-Code. **Sollte in Vercel gesetzt sein.** Ohne sie fällt die App auf den Host des Requests zurück, und das nur noch für `localhost` — bei einem fremden Host-Header bricht die Code-Erzeugung mit einer verständlichen Meldung ab, statt einen QR-Code zu erzeugen, der den Klartext-Token an einen fremden Server schickt. Im Dev zeigt der Code entsprechend auf `localhost`, funktioniert auf dem Handy also nicht: **Handy-Tests über die Produktions- oder Preview-URL** machen.
- Keine Cron-Jobs, keine Webhooks, keine externen Dienste. Die Zeiterfassung hat keine Abhängigkeit außerhalb der eigenen Datenbank — das Vercel-Hobby-Cron-Limit ist hier irrelevant.
- `qrcode` steht in `serverExternalPackages` (Next darf es nicht bundeln); QR-Codes werden serverseitig als Data-URL erzeugt.
