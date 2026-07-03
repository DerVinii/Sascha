# Postfach-Reiter: Implementierungsplan

> Stand: 2026-07-03 · Status: **Plan fertig, wartet auf Credentials/Entscheidungen (siehe §9)**
> Recherche: 10 Agenten (Instantly-API, Microsoft Graph, Codebase, 4 gezielte Nachrecherchen), Quellen: developer.instantly.ai, learn.microsoft.com, vercel.com/docs + empirische API-Probes.

## 1. Ziel

Der Reiter **Postfach** (`/postfach`, aktuell Platzhalter) bekommt zwei Funktionsbereiche:

1. **Instantly.ai-Tracking** — die Sending-Postfächer aus Instantly überwachen (Warmup/Health/Status/Limits) **und** die Unibox nachbauen (eingehende Antworten aus Cold-Outreach-Kampagnen lesen & direkt beantworten).
2. **Echtes E-Mail-Postfach („Outlook")** — Saschas persönliches Postfach anbinden mit dem Funktionsumfang eines echten Mail-Clients: Ordner, Lesen, Beantworten, Weiterleiten, Verfassen, Anhänge, Suche, Gelesen/Ungelesen, Verschieben, Löschen.

## 2. Rechercheergebnisse (das Fundament des Plans)

### 2.1 Instantly.ai — ✅ komplett startklar, keine neuen Credentials nötig

Empirisch verifiziert (Live-Probes mit dem echten Key):

- Workspace „Sascha" läuft auf dem **Growth-Plan** (`pid_g_v2`). API v2 ist auf allen Outreach-Plänen enthalten.
- Der vorhandene `INSTANTLY_API_KEY` (in Vercel gesetzt) hat Scope **`all:all`** — deckt alles ab (accounts, emails, webhooks). Kein neuer Key nötig.
- **Webhooks funktionieren auf Growth** (Test-Webhook erfolgreich erstellt + wieder gelöscht) → Push-Architektur für die Unibox ist möglich.
- Harte Grenze: `GET /api/v2/emails` hat ein eigenes Limit von **20 Requests/Minute** (Rest: 100/s, 6000/min workspace-weit) → Polling nur als Backfill, nie als Primärkanal.

Wichtigste Endpunkte (alle unter `https://api.instantly.ai/api/v2`, Header `Authorization: Bearer <key>`):

| Zweck | Endpunkt |
|---|---|
| Sending-Accounts + Warmup/Status | `GET /accounts` (Felder: `status` 1/2/3/-1/-2/-3, `warmup_status` 0/1/-1/-2/-3, `stat_warmup_score`, `daily_limit`, `provider_code`, `status_message`) |
| Warmup-Verlauf | `POST /accounts/warmup-analytics` (max. 100 E-Mails/Call, liefert `health_score` + Tagesdaten inbox/spam) |
| Sende-Statistik pro Account/Tag | `GET /accounts/analytics/daily` (sent, bounced, opened, replies …) |
| Kampagnen-Analytics | `GET /campaigns/analytics`, `.../overview`, `.../daily` |
| Unibox: Thread-Liste | `GET /emails?latest_of_thread=true&preview_only=true` (⚠ 20/min) |
| Unibox: Thread-Detail | `GET /emails?search=thread:<uuid>` |
| Einzel-Mail inkl. HTML | `GET /emails/{id}` |
| Antworten | `POST /emails/reply` (`reply_to_uuid`, `eaccount`, `subject`, `body:{html,text}`) — **nur Replies, kein freies Compose** |
| Gelesen-Status | `PATCH /emails/{id}` (`is_unread` 0/1) · Thread: `POST /emails/threads/{id}/mark-as-read` |
| Ungelesen-Badge | `GET /emails/unread/count` |
| Lead-Interesse setzen | `POST /leads/update-interest-status` (1=Interested … -1=Not Interested; 202 async) |
| Webhook anlegen | `POST /webhooks` (`target_hook_url`!, `event_type:"reply_received"`, `headers` für Shared-Secret — es gibt KEINE Signatur) |

Gotchas: `is_unread` ist Zahl (0/1) am Objekt, aber Boolean als Query-Param · Cursor = `next_starting_after` · für Sync-Cursor `timestamp_created` nutzen (nicht `timestamp_email`) · Webhook-Payload von `reply_received` enthält bereits `reply_html/reply_text` + `email_id` (= `reply_to_uuid`) → Reply-Flow komplett ohne GET möglich.

### 2.2 Microsoft/Outlook — ⚠ kritische offene Frage

Domain-Recherche (DNS + Microsoft-Realm-Discovery) ergab:

- `sk-dozentundcoach.de` ist **bei Webador gehostet** (MX `mail.webador.com`, Autodiscover explizit geblockt) und in **keinem Entra-ID-Tenant** verifiziert → es gibt **kein Microsoft-365-Business-Postfach** auf der Firmendomain.
- Saschas öffentlich publizierte Adresse ist `Sascha.kunze1989@web.de` (Impressum) — web.de ist ebenfalls kein Microsoft-Postfach.
- Nirgendwo im Projekt (Repo, Git-Historie, Docs, DB) ist eine Outlook-Adresse dokumentiert.

**Konsequenz — drei mögliche Fälle, die die Architektur bestimmen:**

| Fall | Bedeutung | Anbindung |
|---|---|---|
| **(a)** Sascha hat ein echtes Microsoft-Konto (@outlook.de/@outlook.com/@hotmail.de o. Ä.) | Graph-API möglich | **Microsoft Graph, delegated OAuth** (Plan §5) |
| **(b)** „Outlook" = die Outlook-*App*, dahinter das Webador-Postfach (z. B. info@sk-dozentundcoach.de) | Graph **unmöglich** (Graph kann keine Fremd-IMAP-Postfächer) | **IMAP/SMTP** (Plan §5-Alt) |
| **(c)** web.de-Postfach | Graph unmöglich | **IMAP/SMTP** (IMAP muss in web.de-Einstellungen aktiviert werden) |

Für Fall (a) gilt (da kein Business-Tenant existiert): **einzige Option ist der delegated Authorization-Code-Flow** über `/common` mit `offline_access` — Client-Credentials/App-Only geht bei privaten Microsoft-Konten prinzipiell nicht.

### 2.3 Vercel — Hobby-Plan bestimmt die Sync-Architektur

- Team `wyvernai` ist auf **Hobby**: Crons max. **1×/Tag**, Streuung ±59 min, Best-Effort (keine Retries, Duplikate möglich). Häufigere Cron-Expressions lassen **den Deploy fehlschlagen**.
- Konsequenz: Frische kommt aus **Webhooks (Push)** + **On-Demand-Sync beim Öffnen des Reiters**; der tägliche Cron übernimmt nur Wartung (Graph-Subscription-Renewal mit ≥48 h Puffer, Refresh-Token-Keep-Alive). Cron-Endpunkte mit `CRON_SECRET` (Bearer) absichern.
- Functions dürfen bis 300 s laufen (ausreichend).
- Ich habe **lokalen Vercel-API-Zugriff** (CLI-Token vorhanden): Env-Vars kann ich selbst setzen/lesen — dafür ist keine Nutzeraktion nötig.

### 2.4 Ist-Zustand Codebase

- `/postfach` = 21-Zeilen-Platzhalter. `email_threads` + `email_messages` existieren bereits im Schema (org-scoped, aktuell 0 Zeilen, read-only auf der Kontakt-Detailseite konsumiert) — ideal als Ziel für Unibox-Replies → Mail-Historie am CRM-Kontakt.
- Instantly-Client existiert (`src/lib/server/instantly/client.ts`), bisher nur Campaigns/Leads — wird um Accounts/Emails/Webhooks erweitert.
- House-Style: Server-Component-Fetch via `requireActiveOrg()` + Drizzle → Props an Client-Komponente; Mutationen als `"use server"`-Actions mit `revalidatePath`.
- **Die App ist öffentlich (kein Login!)** — sobald ein echtes Postfach angebunden ist, könnte jeder mit der URL Saschas Mails lesen. → §7 Zugangsschutz.

## 3. Ziel-UI

Drei Unteransichten im Postfach (Sidebar-Subitems wie beim Pipelines-Muster):

```
/postfach            → Outlook-Postfach (3-Spalten: Ordner | Mail-Liste | Lesebereich)
/postfach/unibox     → Instantly Unibox (Thread-Liste | Konversation | Reply-Composer)
/postfach/accounts   → Sending-Accounts-Dashboard (Tabelle + Warmup-Sparklines + Kampagnen-KPIs)
```

- **Outlook-Ansicht**: Ordnerbaum (well-known + Unterordner, Unread-Badges), Mail-Liste (Absender, Betreff, Preview, Zeit, Anhang-Icon, ungelesen fett), Lesebereich (HTML sandboxed in iframe, Anhänge downloadbar), Toolbar: Antworten / Allen antworten / Weiterleiten / Verschieben / Löschen / Gelesen-Toggle / Flag, „Neue E-Mail"-Button, Suchfeld (Graph `$search`), Composer als Modal/Panel mit To/Cc/Bcc, HTML-Editor, Anhang-Upload.
- **Unibox**: Filter nach Kampagne/Account/Ungelesen, Interest-Status-Buttons (Interessiert/Nicht interessiert/Meeting …), Antworten über das jeweilige Sending-Account, Link zum CRM-Kontakt.
- **Accounts-Dashboard**: Status-Ampel (Aktiv/Pausiert/Fehler), Warmup-Score, Tageslimit, Provider, Gesendet/Bounces/Replies (7/30 Tage), Pause/Resume-Action.

## 4. Datenmodell (neue Tabellen)

```
mailbox_connections        — 1 Zeile je verbundenem Postfach (org-scoped)
  id, orgId, kind ('ms_graph' | 'imap'), emailAddress,
  encryptedCredentials (text; AES-256-GCM: Refresh-Token bzw. IMAP-Passwort),
  accessToken + accessTokenExpiresAt (Cache), status ('ok'|'reconnect_required'),
  lastSyncAt, graphSubscriptionId, graphSubscriptionExpiresAt, createdAt

instantly_emails           — Spiegel der Unibox (webhook-fed + Poll-Backfill)
  id (= Instantly-Email-UUID, PK), orgId, threadId (Instantly-Thread-UUID),
  campaignId, campaignName, eaccount, leadEmail, direction ('received'|'sent'),
  subject, bodyHtml, bodyText, contentPreview, isUnread, iStatus,
  timestampCreated, timestampEmail, contactId (FK contacts, nullable — Match über leadEmail),
  raw jsonb

sync_state                 — Cursor & Wartungszustand
  id, orgId, key (z. B. 'instantly_backfill_cursor', 'graph_delta_inbox'), value text, updatedAt
```

- **Outlook-Mails werden NICHT persistiert** (Live-Proxy gegen Graph mit kurzem In-Request-Cache). Begründung: kein PII-Spiegel in der öffentlichen App, kein Sync-Drift, Graph ist schnell genug; Delta/Persistenz kann später kommen. Graph-IDs, die wir referenzieren (z. B. für Reply), laufen immer über den `Prefer: IdType="ImmutableId"`-Header (§6.3).
- **Instantly-Mails werden persistiert** (Webhook-Push + 20/min-Limit machen Live-Proxy unmöglich). Match auf `contacts.email` → erscheint automatisch in der CRM-Kontakt-Historie (Folgeausbau: zusätzlich in `email_threads/email_messages` spiegeln).

## 5. Outlook-Anbindung — Fall (a): Microsoft Graph

**Auth (einmalig eingerichtet, dann dauerhaft):**

1. Azure App Registration (macht Vincent, Anleitung §9): supported account types „Any org + personal Microsoft accounts", Platform **Web** (nicht SPA! SPA-Redirect-URIs kappen Refresh-Tokens auf 24 h), Redirect `https://sascha-wyvernai.vercel.app/api/auth/microsoft/callback`.
2. Connect-Flow in der App (Einstellungen oder Postfach-Empty-State): Button „Mit Microsoft verbinden" → `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` mit `scope=offline_access openid User.Read Mail.ReadWrite Mail.Send`, `state`-CSRF + PKCE.
3. Callback-Route tauscht Code am `/token`-Endpoint (mit `client_secret`), speichert **Refresh-Token AES-256-GCM-verschlüsselt** in `mailbox_connections` (Schlüssel `TOKEN_ENCRYPTION_KEY` aus Vercel-Env — Env-Var geht nicht für den Token selbst, weil er rotiert).
4. Token-Wrapper `getGraphToken()`: Access-Token cachen (~75 min Lebensdauer), bei Ablauf per Refresh-Token erneuern, **den neu zurückgegebenen Refresh-Token immer atomar persistieren** (Microsoft rotiert ihn bei jedem Refresh; 90-Tage-Inaktivitäts-Verfall), Refreshes serialisieren (DB-Lock), bei `invalid_grant` → Status `reconnect_required` + UI-Banner „Postfach neu verbinden".

**Mail-Funktionen (Graph v1.0, alle Requests mit `Prefer: IdType="ImmutableId"` außer `$search`):**

| Funktion | Umsetzung |
|---|---|
| Ordner | `GET /me/mailFolders?$top=100` (+ `childFolders` rekursiv); well-known names (inbox, sentitems, drafts, deleteditems, junkemail, archive) |
| Liste | `GET /me/mailFolders/{id}/messages?$top=25&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,flag,importance` · Paging **nur** via `@odata.nextLink` |
| Lesen | `GET /me/messages/{id}` (HTML default); Rendering in sandboxed iframe |
| Antworten/Weiterleiten | `POST /me/messages/{id}/createReply|createReplyAll|createForward` → Draft mit zitierter Historie → `PATCH` Body → `POST .../send` (erlaubt Anhänge; niemals `comment` UND `message.body` zugleich) |
| Neue Mail | Draft-Flow: `POST /me/messages` → Anhänge → `POST .../send` (statt `sendMail`, damit wir die ID der gesendeten Mail haben) |
| Anhänge lesen | `GET .../attachments?$select=id,name,contentType,size` · Download über eigene Proxy-Route `GET .../attachments/{id}/$value` |
| Anhänge hochladen | <3 MB: `POST .../attachments` (base64) · 3–150 MB: `createUploadSession` + sequentielle 4-MB-PUTs (ohne Auth-Header!) |
| Gelesen/Flag | `PATCH /me/messages/{id}` (`isRead`, `flag`) |
| Verschieben | `POST /me/messages/{id}/move {destinationId}` |
| Löschen | Outlook-Semantik: `move` nach `deleteditems` (kein hartes DELETE) |
| Suche | `GET /me/messages?$search="..."` (**ohne** ImmutableId-Header — bekannter Microsoft-Bug; IDs danach via `translateExchangeIds` konvertieren, `targetIdType:"restImmutableEntryId"`), max. 1000 Treffer, Sortierung fix |
| Frische | Graph-Change-Notification-Subscription auf `inbox` (Lifetime <7 Tage, `clientState`-Secret, Validierungs-Handshake: URL-decodeter Token als text/plain in <10 s, Notifications in <3 s mit 202 beantworten) → revalidiert die Postfach-Route; Renewal im täglichen Cron + lazy beim Tab-Load |

**Pflicht-Smoke-Test nach erstem Connect** (ImmutableId empirisch unverifiziert): GET Mail mit Header → `move` mit Header → GET alte ID (erwartet 200, gleiche ID) → `createReply` auf gespeicherte ID. Fallback bei Fehlschlag: Reconciliation über `internetMessageId`-Filter.

**Throttling**: 10.000 Req/10 min und **max. 4 parallele Requests** pro Postfach; 429 → `Retry-After` respektieren.

## 5-Alt. Outlook-Anbindung — Fälle (b)/(c): IMAP/SMTP

Falls das Postfach Webador oder web.de ist (kein Microsoft): gleicher UI-Plan, anderer Unterbau:

- Bibliotheken: `imapflow` (IMAP, liest Ordner/Mails/Flags) + `nodemailer` (SMTP-Versand) + `mailparser` (MIME→HTML).
- Credentials: Host/Port/User/Passwort für IMAP + SMTP, verschlüsselt in `mailbox_connections` (`kind:'imap'`).
- Funktionsabdeckung: Ordner ✓, Liste ✓, Lesen ✓, Antworten/Weiterleiten/Compose ✓ (Zitat-Historie bauen wir selbst), Anhänge ✓, Verschieben/Löschen/Gelesen ✓, Suche = IMAP-SEARCH (einfacher als Graph), **kein Push** → Frische nur via On-Demand-Sync beim Tab-Load (+ optional externer Scheduler).
- Vercel-Caveat: IMAP über Serverless erfordert kurze Connection-Lifecycles (verbinden→lesen→trennen pro Request); machbar, aber langsamer als Graph. web.de: IMAP muss vom Nutzer im Webmail aktiviert werden.

## 6. Sync- & Frische-Architektur (Hobby-tauglich)

1. **Instantly-Push**: `POST /api/instantly/webhook` — Webhook-Registrierung per Code (idempotent beim Setup): `reply_received`, `auto_reply_received`, `email_sent`, `lead_*`. Auth über mitgesendeten Shared-Secret-Header (`X-Webhook-Secret`, da Instantly keine Signaturen kann). Payload direkt in `instantly_emails` upserten + `revalidatePath("/postfach/unibox")`.
2. **Instantly-Backfill**: Server-Action „Aktualisieren" + automatisch beim Tab-Load, wenn `lastSyncAt` > 2 min: `GET /emails?email_type=received&min_timestamp_created=<cursor>` (Budget: ≤3 Calls/Load, weit unter 20/min); Accounts-Dashboard lädt live (kein 20/min-Limit auf `/accounts`).
3. **Graph-Push**: Subscription → Notification-Route → 202 sofort, dann `revalidatePath`. Kein Mail-Inhalt in der Notification nötig (UI lädt live von Graph).
4. **Täglicher Cron** (`vercel.json`, z. B. `0 3 * * *`, `CRON_SECRET`-geschützt, idempotent): Graph-Subscription verlängern (immer, Puffer ≥48 h) · Refresh-Token-Keep-Alive (90-Tage-Fenster) · Instantly-Backfill-Reconciliation.

## 7. Sicherheit

- **Zugangsschutz (dringend empfohlen, vor Phase 3)**: App ist öffentlich; mit verbundenem Postfach läse jeder Besucher echte Mails. Minimal-Lösung: Passwort-Gate via Middleware (`APP_PASSWORD`-Env → signiertes HttpOnly-Cookie), Login-Seite im App-Look. Kein User-System nötig.
- Secrets: `MS_CLIENT_ID`/`MS_CLIENT_SECRET`/`TOKEN_ENCRYPTION_KEY`/`CRON_SECRET`/`INSTANTLY_WEBHOOK_SECRET` in Vercel-Env (setze ich selbst via Vercel-API); Refresh-Token/IMAP-Passwort nur verschlüsselt in DB; nichts davon je ins Repo (öffentlich!).
- Client-Secret läuft nach max. 24 Monaten ab → Erinnerung dokumentieren; Ablauf bricht auch den Refresh-Grant.
- HTML-Mails nur sandboxed rendern (iframe `sandbox`, keine externen Requests ohne Klick), Anhänge über authentifizierte Proxy-Route.
- Instantly-Key ist `all:all` (maximal privilegiert) — bleibt nur in Vercel-Env/`.env.local`.

## 8. Implementierungsphasen

| Phase | Inhalt | Voraussetzung |
|---|---|---|
| **0** | Zugangsschutz (Passwort-Gate) + `CRON_SECRET`/`TOKEN_ENCRYPTION_KEY`-Setup + Sidebar/Header/Routen-Gerüst `/postfach{,/unibox,/accounts}` | Passwort-Entscheidung |
| **1** | **Accounts-Dashboard**: Instantly-Client um `listAccounts`-Detailfelder, `warmupAnalytics`, `dailyAnalytics` erweitern; Dashboard-UI | ✅ nichts — Key vorhanden |
| **2** | **Unibox**: Tabellen-Migration (`instantly_emails`, `sync_state`), Webhook-Route + -Registrierung, Backfill, Thread-UI, Reply, Interest-Status, Kontakt-Match | ✅ nichts |
| **3** | **Postfach-Anbindung**: Fall (a) OAuth-Flow + Token-Wrapper + Smoke-Test **oder** Fall (b/c) IMAP-Client + Credential-Setup | ⛔ §9 |
| **4** | **Mail-Client-UI komplett**: Ordner/Liste/Lesen/Antworten/Weiterleiten/Compose/Anhänge/Suche/Move/Delete/Flags | Phase 3 |
| **5** | **Frische & Wartung**: Graph-Subscription + Notification-Route, täglicher Cron, Reconnect-Banner | Phase 3/4 |
| **6** | **CRM-Verzahnung**: Unibox-/Outlook-Verkehr an Kontakt-Historie (`email_threads`/`email_messages`), „E-Mail senden" vom Kontakt aus | Phase 2+4 |

Jede Phase endet mit Review-Workflow (Compiler-Ersatz, da kein lokales Node), Commit+Push, Deploy-Verifikation gegen die Live-URL.

## 9. Credentials & Entscheidungen (WARTET AUF INPUT)

**Vorhanden (keine Aktion nötig):** Instantly-API-Key (Vercel, `all:all`, verifiziert) · Datenbankzugriff · Vercel-API-Token (Env-Vars setze ich selbst).

**Benötigt:**

1. **Die Kernfrage: Welche Mailadresse soll angebunden werden — und was ist sie technisch?**
   (a) echtes Microsoft-Konto → weiter mit 2. · (b) Webador (info@…) oder (c) web.de → stattdessen IMAP/SMTP-Zugangsdaten liefern (Host/Port/User/Passwort; bei web.de vorher IMAP im Webmail aktivieren).
2. **Nur Fall (a): Azure App Registration** (5 Minuten, beliebiges Microsoft-Konto von Vincent reicht):
   portal.azure.com → Microsoft Entra ID → App registrations → *New registration* → Name „SK Kommandozentrale Postfach" → Supported account types: **„Accounts in any organizational directory and personal Microsoft accounts"** → Redirect URI: Platform **Web**, `https://sascha-wyvernai.vercel.app/api/auth/microsoft/callback` → Register. Dann *Certificates & secrets* → *New client secret* (24 Monate) → **Value sofort kopieren**. → Mir geben: **Application (client) ID + Secret-Value**. Nach Deploy klickt der Postfach-Inhaber einmal „Mit Microsoft verbinden".
3. **Zugangsschutz-Entscheidung**: Passwort-Gate ja/nein (empfohlen: ja) + Wunsch-Passwort.

## 10. Risiken

- **Hobby-Plan**: keine minütlichen Crons (Deploy bricht sonst!), Cron-Jitter ±59 min → Architektur ist darauf ausgelegt; echte Hintergrund-Frische für Instantly bräuchte Pro oder externen Scheduler. (Hinweis: Hobby ist offiziell für nicht-kommerzielle Nutzung gedacht.)
- **90-Tage-Inaktivität** tötet den Microsoft-Refresh-Token → täglicher Keep-Alive + Reconnect-UI als Fangnetz.
- **ImmutableId** empirisch unverifiziert → Pflicht-Smoke-Test in Phase 3; Fallback `internetMessageId`.
- **Instantly kann kein freies Compose** (nur Replies) → „Neue Mail" gibt es nur im Outlook-Teil.
- **20 req/min auf `GET /emails`** ist workspace-weit → alle Poll-Pfade budgetiert, Push als Primärkanal.
