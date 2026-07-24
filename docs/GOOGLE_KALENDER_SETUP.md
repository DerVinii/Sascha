# Google-Kalender-Anbindung – Einrichtung

Der Code ist fertig und deployt. Es fehlen nur noch **zwei Werte aus der Google
Cloud Console**, die nur über Saschas Google-Login erzeugt werden können:
`GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`. Danach klickt Sascha in der App
einmal „Mit Google verbinden" – fertig.

Dauer: ~10 Minuten.

---

## Was schon erledigt ist

- ✅ Code (OAuth, beidseitiger Sync, UI unter **Einstellungen › Kalender**)
- ✅ Datenbank-Migration
- ✅ `GOOGLE_TOKEN_SECRET` (Token-Verschlüsselung) – in Vercel gesetzt
- ✅ `GOOGLE_REDIRECT_URI = https://sascha-wyvernai.vercel.app/api/google/callback` – in Vercel gesetzt

---

## Schritt 1 – Google Cloud Console öffnen

1. Mit **Saschas Google-Konto** (dem, dessen Kalender synchronisiert werden soll)
   auf <https://console.cloud.google.com> gehen.
2. Oben ein **Projekt** wählen. Tipp: Es existiert vermutlich schon ein Projekt
   (für den `GOOGLE_PLACES_API_KEY`) – das kann wiederverwendet werden. Sonst oben
   auf „Projekt auswählen → Neues Projekt", Name z. B. `Sascha CRM`.

## Schritt 2 – Calendar-API aktivieren

1. Links im Menü **„APIs & Dienste" → „Bibliothek"**.
2. Nach **„Google Calendar API"** suchen, anklicken, **„Aktivieren"**.

## Schritt 3 – OAuth-Zustimmungsbildschirm

(Falls schon eingerichtet, direkt zu Schritt 4.)

Zu verbindendes Konto: **saschaduble@gmail.com** (normales Gmail – funktioniert
über OAuth ohne Sonderbehandlung). Das Cloud-Projekt selbst darf einem beliebigen
Google-Konto gehören, nicht zwingend saschaduble.

1. **„APIs & Dienste" → „OAuth-Zustimmungsbildschirm"**.
2. Nutzertyp **„Extern"** wählen → „Erstellen".
3. Pflichtfelder:
   - App-Name: `Sascha CRM`
   - Support-E-Mail: eine eigene Adresse
   - Entwickler-Kontakt: eine eigene Adresse
4. Speichern und weiter durch die Schritte (Scopes können leer bleiben).
5. **Testnutzer:** `saschaduble@gmail.com` hinzufügen (solange die App im
   „Test"-Status ist, dürfen nur eingetragene Nutzer sich verbinden).

> ⚠️ **Wichtig – 7-Tage-Ablauf umgehen:** Im Status „Testing" laufen Googles
> Refresh-Tokens nach **7 Tagen** ab, d. h. die Sync bricht wöchentlich ab.
> Deshalb den Zustimmungsbildschirm auf **„In Produktion" veröffentlichen**
> (Button „App veröffentlichen"). Beim ersten Verbinden erscheint dann einmalig
> „Google hat diese App nicht überprüft" → **Erweitert → Trotzdem fortfahren**.
> Danach bleibt die Verbindung dauerhaft. Für ein einzelnes privates Konto ist
> keine Google-Verifizierung nötig.

## Schritt 4 – OAuth-Client-ID erstellen

1. **„APIs & Dienste" → „Anmeldedaten"**.
2. Oben **„+ Anmeldedaten erstellen" → „OAuth-Client-ID"**.
3. Anwendungstyp: **„Webanwendung"**.
4. Name: z. B. `Sascha CRM Web`.
5. Unter **„Autorisierte Weiterleitungs-URIs" → „URI hinzufügen"** exakt eintragen:

   ```
   https://sascha-wyvernai.vercel.app/api/google/callback
   ```

   (Optional für lokale Tests zusätzlich: `http://localhost:3000/api/google/callback`)
6. **„Erstellen"**. Es erscheinen **Client-ID** und **Client-Schlüssel** – beide
   kopieren (den Schlüssel bekommt man später über das Stift-Symbol wieder).

## Schritt 5 – Die zwei Werte in Vercel eintragen

Im Vercel-Projekt **Settings → Environment Variables** (oder per CLI) für
**Production** setzen:

| Name | Wert |
|------|------|
| `GOOGLE_CLIENT_ID` | die kopierte Client-ID (endet auf `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | der kopierte Client-Schlüssel |

Danach **einmal neu deployen** (Env-Änderungen greifen erst nach Redeploy).

> Wenn du mir Client-ID und Secret gibst, setze ich sie per Vercel-CLI und stoße
> den Redeploy an. Alternativ trägst du sie selbst ein – dann ist nichts an mich
> weitergegeben.

## Schritt 6 – In der App verbinden

1. In der App **Einstellungen › Kalender** öffnen.
2. **„Mit Google verbinden"** klicken → Google-Login/Zustimmung mit Saschas Konto.
3. Nach der Rückleitung steht dort „Verbunden · <E-Mail>". Der erste Abgleich
   läuft automatisch.

---

## Wie die Synchronisierung läuft

- **Google → App:** beim Öffnen des Kalenders (gedrosselt), per „Sync"-Button und
  täglich per Cron. Inkrementell (nur Änderungen).
- **App → Google:** Termine, die im CRM-Kalender angelegt/geändert/gelöscht werden,
  landen sofort im Google-Kalender.
- CRM-Aufgaben (rosé) bleiben lokal und werden **nicht** nach Google geschrieben.

## Fehlerbehebung

- **„Serverseitig noch nicht eingerichtet"** in Einstellungen › Kalender →
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` fehlen oder kein Redeploy erfolgt.
- **„redirect_uri_mismatch"** von Google → die URI in Schritt 4 stimmt nicht exakt
  mit `GOOGLE_REDIRECT_URI` überein (Tippfehler, http statt https, Slash am Ende).
- **„Zugriff blockiert / App nicht verifiziert"** → Saschas Adresse als Testnutzer
  eintragen (Schritt 3.5) oder App veröffentlichen.
- **Kein Refresh-Token / Verbindung bricht ab** → in Saschas Google-Konto unter
  <https://myaccount.google.com/permissions> den App-Zugriff entfernen und in der
  App erneut „Verbinden" klicken.
