# Zeiterfassung: Architektur & Entscheidungen

> Stand: 2026-07-29 · Status: **fertig** — Mitarbeiter- und Admin-Bereich, CSV-Export und Navigation stehen, Migration ist gelaufen, Build grün.
> Herkunft: portiert aus einem bestehenden Zeiterfassungs-System eines anderen Kunden (Next 14 + Prisma). Übernommen wurde **nur die Fachlogik** — Stack, Datenzugriff und Design folgen komplett diesem Projekt.

## 1. Ziel

Sascha braucht eine Zeiterfassung für seine Mitarbeiter. Die Mitarbeiter stempeln per Handy — kein Terminal, keine Zugangsdaten, die sie sich merken müssen. Sie legen sich die Stempeluhr als **eigene App** auf den Startbildschirm und koppeln das Handy dort **einmalig per Kopplungscode**; danach ist es dauerhaft als „dieses Gerät gehört Person X" bekannt.

Sascha selbst sieht in der Kommandozentrale, wer gerade eingestempelt ist, korrigiert vergessene oder falsche Zeiten, trägt Krankmeldungen ein, verwaltet Mitarbeiter und Geräte und exportiert Monatsabrechnungen als CSV.

## 2. Routen-Architektur — und warum sie so ist

| Bereich | Routen | Wer | Schutz |
|---|---|---|---|
| **Admin** | `/zeiterfassung*` | Sascha | APP_PASSWORD-Gate der Middleware (wie der Rest der App), im `(app)`-Layout mit Sidebar/Header |
| **Mitarbeiter** | `/zeit`, `/zeit/*` | Team | **bewusst vom Gate ausgenommen** — dafür Geräte-Cookie `sk_zeit_geraet`, serverseitig geprüft |

Der Grund für die Trennung: Die Mitarbeiter kennen das APP_PASSWORD nicht und sollen es nie erfahren — es öffnet die komplette Kommandozentrale mit allen Kontakt- und Vertriebsdaten. Ein zweites Passwort nur für die Zeiterfassung wäre wieder etwas, das man vergisst, weitergibt oder aufschreibt. Stattdessen ist **das gekoppelte Gerät der Ausweis**: Wer den Code einmal eingegeben hat, ist danach identifiziert.

Der Mitarbeiterbereich ist deshalb ohne Passwort erreichbar, aber **nicht ungeschützt**: Jede `/zeit`-Seite und jede zugehörige Server-Action ruft `requireDeviceEmployee()` aus `src/lib/server/zeiterfassung/auth.ts` auf. Ohne gültiges Gerät gibt es keine Daten und keine Mutation — Schutz liegt in der Anwendung, nicht in der Middleware.

Mitarbeiter-Seiten:

```
/zeit                      → leitet weiter auf /zeit/stempel
/zeit/einladung/[token]    → persönlicher Einrichtungs-Link: Gerätewahl + Anleitung
/zeit/einladung/[token]/manifest → PWA-Manifest dieser Einladung (siehe §4.1)
/zeit/stempel              → Stempeluhr; ohne Gerät ein Hinweis auf den Link
/zeit/meine-zeiten         → eigene Einträge, Monatsnavigation, Gerät abmelden
```

Admin-Seiten: `/zeiterfassung` (Live-Übersicht), `/zeiterfassung/mitarbeiter` (Liste, Anlegen mit Link, Monatsexport), `/zeiterfassung/mitarbeiter/[id]` (neuer Link, Geräte, Zeiten, Korrekturen).

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

1. Sascha legt den Mitarbeiter unter `/zeiterfassung/mitarbeiter` an. Das Anlegen erzeugt **sofort den Einrichtungs-Link** — ein Mitarbeiter ohne Einladung kann nichts, ein Extraklick dafür wäre nur eine Stelle zum Vergessen. Für bestehende Mitarbeiter gibt es denselben Link auf der Detailseite („Einrichtungs-Link erzeugen").
2. Sascha schickt den Link (Kopieren-Knopf oder direkt per WhatsApp). Der Token darin ist 32 zufällige Bytes; in der DB landet **nur sein SHA-256** (`tokenLookup`). Ein Datenbankleck gibt niemandem Zugang.
3. Der Link ist **7 Tage** gültig und **einmal** einlösbar (`consumed`). Sieben Tage, weil er per Messenger verschickt und nicht unbedingt sofort geöffnet wird; das Risiko bleibt klein, weil er genau ein Gerät koppelt und Sascha jedes gekoppelte Handy in der Geräteliste sieht.
4. Der Mitarbeiter öffnet den Link, wählt **iPhone oder Android** und bekommt die passende Anleitung. Nach der Installation öffnet er die App über das neue Symbol — und **damit ist er angemeldet**. `einladungEinloesen` prüft (nicht abgelaufen, nicht verbraucht, richtige Org, Mitarbeiter aktiv), entwertet die Einladung, legt ein `employee_devices`-Gerät an — wieder nur mit dem Hash — und setzt das Cookie `sk_zeit_geraet` (HttpOnly, `secure`, `sameSite: lax`).
5. Cookie-Laufzeit: **730 Tage**. Das Handy bleibt gekoppelt, bis es gesperrt wird oder der Nutzer Browserdaten löscht. Bei jedem Zugriff wird `lastSeenAt` aktualisiert; ein gesperrtes (`revoked`) Gerät fällt sofort raus.

Verlorenes Handy = Gerät in der Admin-Ansicht sperren, neuen Link erzeugen. Alter Zugang tot, kein Passwortwechsel für alle nötig. Der Mitarbeiter kann sein Gerät außerdem selbst abmelden (unter „Meine Zeiten") — praktisch beim Handywechsel oder wenn ein Diensthandy zurückgegeben wird.

Die Option „Bereits eingerichtete Geräte abmelden" beim Erzeugen eines neuen Links ist **standardmäßig aus** und fragt vor dem Ausführen nach. Sie war zunächst vorbelegt, sperrt aber das laufende Handy in dem Moment, in dem der neue Link erzeugt wird — wird er dann nicht sofort benutzt, steht der Mitarbeiter ohne Stempelmöglichkeit da.

### 4.1 Der Kniff: die Einladung ist die `start_url` der App

Hier steckt die eigentliche Idee, und sie ist nicht offensichtlich. Auf dem iPhone bekommt eine zum Startbildschirm hinzugefügte Web-App einen **eigenen Datenspeicher**, getrennt von Safari. Ein Cookie, das beim Öffnen des Links im Browser gesetzt wird, gilt in der installierten App **nicht** — der Mitarbeiter stünde dort vor „nicht angemeldet", und die Einmal-Einladung wäre schon verbraucht.

Deshalb meldet die Einladungsseite ein **eigenes Manifest pro Einladung** (`/zeit/einladung/[token]/manifest`), dessen `start_url` auf genau diese Einladungsseite zeigt. Der Ablauf ergibt sich daraus von selbst:

- Im Browser zeigt die Seite nur die Anleitung. Sie löst **nichts** ein — sonst würde schon eine Linkvorschau in WhatsApp die Einladung abbrennen.
- Nach der Installation startet die App auf ihrer `start_url`, also wieder auf der Einladungsseite — diesmal aber **im Datenspeicher der App**. Dort erkennt sie über `display-mode: standalone`, dass sie als App läuft, und löst die Einladung automatisch ein.
- Ab dann ist ein Cookie da, und dieselbe Seite leitet bei jedem weiteren App-Start sofort auf `/zeit/stempel` weiter.

Das funktioniert unabhängig davon, ob ein Gerät seinen Speicher teilt (Android) oder trennt (iPhone) — ein einziger Weg für beide, und er bleibt richtig, falls Apple sein Verhalten ändert. Für Rechner oder wenn die Installation partout nicht klappt, gibt es unter „Installation klappt nicht?" eine bewusst unscheinbare Rückfalltür, die direkt im Browser anmeldet.

Nebenwirkung, die man kennen sollte: Die `start_url` der installierten App enthält dauerhaft den Einladungs-Token. Der ist nach dem Einlösen entwertet und damit wertlos, taucht aber bei jedem App-Start in den Server-Logs auf.

### 4.2 Zwei getrennte Apps auf einem Handy

`/zeit*` meldet ein eigenes Manifest (`public/zeit.webmanifest`, Name „SK Zeit", `scope: "/zeit"`, `start_url: "/zeit/stempel"`) mit eigenen Symbolen (teal-grüne Uhr statt dunklem „SK"; erzeugt von `scripts/generate-zeit-icons.mjs`). Dadurch lassen sich Kommandozentrale und Stempeluhr **unabhängig voneinander** installieren und liegen als zwei unterscheidbare Symbole nebeneinander. Die Einladungsseite überschreibt dieses Manifest für sich mit der Variante aus §4.1 — gleiche Symbole, nur andere `start_url`.

Wichtig für spätere Änderungen: Beide Manifeste sind **statische Dateien in `public/`** und werden über das Metadaten-Feld `manifest` eingehängt (Root-Layout bzw. `src/app/zeit/layout.tsx`). Die Next-Datei-Konvention `app/manifest.ts` wurde bewusst entfernt — sie hängt ihren Link unabhängig von den Metadaten ein und lässt sich in einem Unter-Layout **nicht** überschreiben; `/zeit` meldete damit weiterhin das Manifest der Kommandozentrale. Wer die Konvention zurückholt, bricht die zweite App.

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
- **Env `NEXT_PUBLIC_APP_URL`**: Basis-URL für den QR-Code auf die Installationsseite. **In Vercel gesetzt** (Production und Preview, Wert `https://sascha-wyvernai.vercel.app`). Ohne sie fällt die App auf den Host des Requests zurück, und das nur noch für `localhost` — bei einem fremden Host-Header bricht die Code-Erzeugung mit einer verständlichen Meldung ab, statt einen QR zu erzeugen, der auf einen fremden Server zeigt. Im Dev zeigt der QR entsprechend auf `localhost`, funktioniert auf dem Handy also nicht: **Handy-Tests über die Produktions-URL** machen.
  Wichtig: `NEXT_PUBLIC_`-Variablen werden **beim Build** fest eingesetzt. Wer den Wert ändert (z. B. später auf eine eigene Domain), muss anschließend neu deployen — ein bloßes Setzen in Vercel reicht nicht. Die Variable ist bewusst als *non-sensitive* angelegt, damit sie mit `vercel env pull` überprüfbar bleibt; ein Geheimnis ist sie ohnehin nicht.
- **Produktion abgenommen (2026-07-29)** gegen `https://sascha-wyvernai.vercel.app`: Passwort-Gate greift für `/zeiterfassung` (307) und den CSV-Export (401), `/zeit/stempel` ist ohne Passwort erreichbar, der Punkt-Pfad-Angriff auf Server Actions wird abgewiesen, ein QR-Link führt zur Einrichtungsseite, das Geräte-Cookie identifiziert den Mitarbeiter, und der CSV-Export liefert BOM + CRLF. Der Kontostand der Zeiterfassungs-Tabellen ist dabei wieder auf null — es liegen noch keine echten Daten vor.
- Keine Cron-Jobs, keine Webhooks, keine externen Dienste. Die Zeiterfassung hat keine Abhängigkeit außerhalb der eigenen Datenbank — das Vercel-Hobby-Cron-Limit ist hier irrelevant.
- `qrcode` steht in `serverExternalPackages` (Next darf es nicht bundeln); QR-Codes werden serverseitig als Data-URL erzeugt.
- **Symbole der Mitarbeiter-App**: `node scripts/generate-zeit-icons.mjs` (nutzt `sharp`). Nur nötig, wenn sich Motiv oder Farbe ändern — die erzeugten PNGs liegen im Repo.
- **Offen: Test auf echten Geräten.** Der Ablauf „installieren, dann koppeln" ist genau deshalb so gebaut, weil das iPhone Safari und installierte App getrennt speichert. Vor dem Ausrollen an das Team einmal auf einem iPhone und einem Android-Gerät durchspielen: installieren, koppeln, App schließen, am nächsten Tag erneut öffnen — das Gerät muss angemeldet bleiben.
