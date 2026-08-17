import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  primaryKey,
  index,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS
// ============================================================================

export const orgRoleEnum = pgEnum("org_role", [
  "owner",
  "admin",
  "sales",
  "instructor",
  "viewer",
]);

export const contactStatusEnum = pgEnum("contact_status", [
  "lead",
  "qualified",
  "in_conversation",
  "meeting_booked",
  "won",
  "lost",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "task",
  "call",
  "meeting",
  "follow_up",
  "note",
]);

export const emailDirEnum = pgEnum("email_dir", ["in", "out"]);

export const leadColumnKindEnum = pgEnum("lead_column_kind", [
  "source", // Rohdaten aus der Source (read-only), z. B. Firmenname aus Google Maps
  "data", // manuell/abgeleitet editierbares Feld
  "enrichment", // läuft pro Zeile (Provider/AI), z. B. Geschäftsführer finden
  "action", // Write-back, z. B. Instantly (Phase 2)
]);

// ============================================================================
// SHARED / MULTI-TENANT
// ============================================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").default("starter").notNull(),
  settings: jsonb("settings").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").default("viewer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.orgId] }),
    index("org_members_org_idx").on(t.orgId),
  ],
);

export const orgInvites = pgTable("org_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgRoleEnum("role").default("sales").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Listen/Ordner für gescrapte & importierte Leads (im Vertrieb sichtbar).
export const leadLists = pgTable(
  "lead_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // 1:1-Verknüpfung zur Instantly-Kampagne (lazy beim "Kampagne einrichten" angelegt).
    instantlyCampaignId: text("instantly_campaign_id"),
    // 1:1-Verknüpfung zu einer Pipeline ("Mit Pipeline verbinden"). Gesetzt =
    // Ordner-Leads werden als Deals in die Pipeline gespiegelt und synchron
    // gehalten; ON DELETE SET NULL löst die Verbindung, wenn die Pipeline weg ist.
    pipelineId: uuid("pipeline_id").references((): AnyPgColumn => pipelines.id, {
      onDelete: "set null",
    }),
    // Klassifizierung des Ordners (n:1 — ein Tag, beliebig viele Ordner).
    // ON DELETE SET NULL: löscht man den Tag, verliert der Ordner nur seine
    // Markierung und bleibt sonst unangetastet.
    tagId: uuid("tag_id").references((): AnyPgColumn => leadListTags.id, {
      onDelete: "set null",
    }),
    // Zielrolle der Entscheider-Suche ("Update cells") für diesen Ordner, z. B.
    // "Akademieleitung". NULL = Geschäftsführung (Standard-Verhalten).
    enrichmentRole: text("enrichment_role"),
    // Hintergrund-Enrichment: gesetzt = "Update cells" läuft (server-seitig, bis geleert).
    enrichmentQueuedAt: timestamp("enrichment_queued_at", { withTimezone: true }),
    // Zeitpunkt des letzten Drain-Ticks — grobe Sperre gegen doppelte Läufe.
    enrichmentTickAt: timestamp("enrichment_tick_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("lead_lists_org_idx").on(t.orgId),
    index("lead_lists_tag_idx").on(t.tagId),
  ],
);

/**
 * Tags zur Klassifizierung der Kampagnen-Ordner ("Nach Tag filtern" im Vertrieb).
 *
 * Bewusst eine eigene Tabelle und nicht das vorhandene `tags`: dort liegen die
 * Kontakt-Tags, die unter Einstellungen → Tags gepflegt werden. Beides in einem
 * Topf würde jede der beiden Oberflächen mit den Einträgen der anderen füllen.
 *
 * Tags leben unabhängig von den Ordnern — man kann einen anlegen, bevor ihn eine
 * Kampagne benutzt (das Filter-Menü erlaubt das ausdrücklich).
 */
export const leadListTags = pgTable(
  "lead_list_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Schlüssel aus LEAD_TAG_COLORS (siehe scraping-types.ts). */
    color: text("color").default("slate").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("lead_list_tags_org_idx").on(t.orgId),
    // Ein Name je Org, Groß-/Kleinschreibung egal: "Schulen" und "schulen"
    // sollen derselbe Tag sein. Der Unique-Index steht als lower()-Ausdruck in
    // scripts/apply-kampagnen-tags.mjs; hier nur als Dokumentation vermerkt.
  ],
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadListId: uuid("lead_list_id").references(() => leadLists.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    domain: text("domain"),
    address: jsonb("address"),
    customFields: jsonb("custom_fields").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("companies_org_idx").on(t.orgId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadListId: uuid("lead_list_id").references(() => leadLists.id, {
      onDelete: "cascade",
    }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    roleInCompany: text("role_in_company"),
    status: contactStatusEnum("status").default("lead").notNull(),
    source: text("source"),
    tags: text("tags").array().default([]).notNull(),
    customFields: jsonb("custom_fields").default({}).notNull(),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("contacts_org_idx").on(t.orgId),
    index("contacts_company_idx").on(t.companyId),
    index("contacts_status_idx").on(t.status),
    index("contacts_email_idx").on(t.email),
  ],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  scope: text("scope").default("contact").notNull(),
});

// ============================================================================
// LEAD-TABLE (Clay-artige Scraping-/Enrichment-Sektion)
// ============================================================================

/**
 * Spaltendefinitionen der Clay-artigen Lead-Table. Die Zeilen selbst sind ein
 * Join aus `contacts` + `companies`; hier liegen nur die Spalten-Configs
 * (Position, Typ, Provider/Prompt, Run-Settings). Zell-Status/Provenienz leben
 * in `contacts.customFields.cells`, Views in `organizations.settings.leadViews`.
 */
export const leadColumns = pgTable(
  "lead_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Ordner-Zuordnung: NULL = globale Spalte (in JEDEM Ordner sichtbar — alle
    // Standard-Spalten). Gesetzt = selbst angelegte Spalte, die NUR in dem Ordner
    // erscheint, in dem sie erstellt wurde. ON DELETE CASCADE räumt die Spalten
    // eines gelöschten Ordners mit auf.
    leadListId: uuid("lead_list_id").references(() => leadLists.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(), // stabiler Schlüssel, z. B. "find_dm", "email"
    label: text("label").notNull(),
    kind: leadColumnKindEnum("kind").notNull(),
    dataType: text("data_type").default("text").notNull(), // text|email|url|number|checkbox|select
    position: integer("position").notNull(),
    width: integer("width").default(180).notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    color: text("color"),
    config: jsonb("config").default({}).notNull(), // provider, inputs, outputs, runSettings, derivedFrom, source, options
    hidden: boolean("hidden").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("lead_columns_org_idx").on(t.orgId),
    index("lead_columns_list_idx").on(t.leadListId),
  ],
);

// ============================================================================
// VERTRIEBS-CRM (Sub-System A)
// ============================================================================

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("pipelines_org_idx").on(t.orgId)],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    color: text("color"),
  },
  (t) => [index("pipeline_stages_pipeline_idx").on(t.pipelineId)],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    valueEur: integer("value_eur"),
    expectedClose: timestamp("expected_close", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("deals_org_idx").on(t.orgId),
    index("deals_pipeline_idx").on(t.pipelineId),
    index("deals_stage_idx").on(t.stageId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assigneeId: uuid("assignee_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("activities_org_idx").on(t.orgId),
    index("activities_due_idx").on(t.dueDate),
    index("activities_contact_idx").on(t.contactId),
  ],
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    subject: text("subject"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("email_threads_contact_idx").on(t.contactId)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    direction: emailDirEnum("direction").notNull(),
    fromAddr: text("from_addr"),
    toAddr: text("to_addr"),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    autoTag: text("auto_tag"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("email_messages_thread_idx").on(t.threadId),
    index("email_messages_message_id_idx").on(t.messageId),
  ],
);

/**
 * E-Mail-Signaturen für das echte Postfach — mehrere pro Organisation, damit
 * jeder Mitarbeiter seine eigene unter eigenem Namen pflegen kann.
 *
 * `html` ist der fertige Signatur-Block inklusive eingebetteter Bilder als
 * Data-URI. Beim Versand werden diese Data-URIs in echte CID-Anhänge
 * umgewandelt (siehe lib/server/mailbox/inline-images.ts) — nur so zeigen
 * Outlook, Gmail & Co. das Bild beim Empfänger wirklich an.
 *
 * `defaultNew` / `defaultReply` stammen aus einer früheren Standardsignatur-
 * Auswahl und werden von der App nicht mehr gelesen. Die Spalten bleiben mit
 * ihren Defaults bestehen, damit keine Migration nötig ist.
 */
export const emailSignatures = pgTable(
  "email_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    html: text("html").default("").notNull(),
    defaultNew: boolean("default_new").default(false).notNull(),
    defaultReply: boolean("default_reply").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("email_signatures_org_idx").on(t.orgId)],
);

/**
 * Spiegel der Instantly-Unibox (Postfach-Reiter). Gefüllt per Webhook
 * (reply_received) + Backfill-Poll; `id` ist die Instantly-Email-UUID.
 * Empfangene Mails werden komplett gespiegelt, gesendete nur für Threads,
 * die geöffnet/beantwortet wurden.
 */
export const instantlyEmails = pgTable(
  "instantly_emails",
  {
    // Instantly-Bezeichner sind KEINE garantierten UUIDs: die v2-API liefert
    // zunehmend präfixierte IDs (z. B. "ac-e9MU…"). Deshalb text statt uuid,
    // sonst bricht der Sync mit „invalid input syntax for type uuid" ab.
    id: text("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    eaccount: text("eaccount"),
    leadEmail: text("lead_email"),
    direction: emailDirEnum("direction").notNull(),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    contentPreview: text("content_preview"),
    isUnread: boolean("is_unread").default(false).notNull(),
    iStatus: integer("i_status"),
    timestampCreated: timestamp("timestamp_created", {
      withTimezone: true,
    }).notNull(),
    timestampEmail: timestamp("timestamp_email", {
      withTimezone: true,
    }).notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    raw: jsonb("raw").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("instantly_emails_org_idx").on(t.orgId),
    index("instantly_emails_thread_idx").on(t.threadId),
    index("instantly_emails_ts_idx").on(t.timestampEmail),
    index("instantly_emails_lead_idx").on(t.leadEmail),
  ],
);

/**
 * Wiederverwendbare Kampagnen-Texte („Vorlagen"): der komplette Satz aus erster
 * Mail und Follow-ups, unter einem Namen gespeichert. Bewusst pro Organisation
 * und NICHT pro Liste — dieselbe Ansprache wird in mehreren Ordnern genutzt
 * (z. B. dieselbe AsAflex-Sequenz für Leipzig, Hannover, Dresden).
 */
export const campaignTemplates = pgTable(
  "campaign_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** CampaignStep[] — Betreff, Text und Verzögerung je Schritt. */
    steps: jsonb("steps").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("campaign_templates_org_idx").on(t.orgId),
    // Ein Name je Org: „Speichern" unter bestehendem Namen aktualisiert die
    // Vorlage, statt eine zweite gleichnamige daneben zu legen.
    unique("campaign_templates_org_name_unique").on(t.orgId, t.name),
  ],
);

/**
 * Sperrliste: Leads, die nie wieder angeschrieben werden dürfen (Widerspruch,
 * „bitte nicht mehr melden", verbrannter Kontakt). Ein Eintrag sperrt über die
 * E-Mail-Adresse ODER den Namen — meist beides, damit derselbe Mensch auch unter
 * einer zweiten Adresse (oder nach einem erneuten Scrape) erkannt wird.
 * Gegriffen wird beim Versand an Instantly (blocklist.ts), nicht beim Scrapen:
 * der Lead darf in der Tabelle stehen, er darf nur keine Mail bekommen.
 */
export const blockedLeads = pgTable(
  "blocked_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Normalisiert (klein, getrimmt). NULL = Eintrag sperrt nur über den Namen. */
    email: text("email"),
    /** Normalisiert (klein, ohne Titel wie "Dr."). NULL = sperrt nur über die E-Mail. */
    name: text("name"),
    /** Freitext: warum gesperrt (z. B. "hat um Löschung gebeten"). */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("blocked_leads_org_idx").on(t.orgId)],
);

/** Generische Sync-Cursor/Zustände (z. B. Instantly-Backfill-Cursor) je Org. */
export const syncState = pgTable(
  "sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sync_state_org_idx").on(t.orgId),
    // Ziel des ON-CONFLICT-Upserts in setSyncValue — Name wie in der Live-DB.
    unique("sync_state_org_key_unique").on(t.orgId, t.key),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: uuid("author_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("notes_contact_idx").on(t.contactId)],
);

// ============================================================================
// KALENDER (Termine — eigenständig, plus Overlay der CRM-Aktivitäten)
// ============================================================================

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "meeting",
  "call",
  "task",
  "reminder",
  "other",
]);

/**
 * Eigenständige Kalender-Termine (Meetings, Calls, Erinnerungen …). Ergänzt
 * im Kalender-Reiter die read-only eingeblendeten CRM-Aktivitäten mit Fälligkeit.
 * Zeiten liegen als timestamptz; die Tages-Zuordnung passiert im Client in der
 * lokalen Zeitzone (Europe/Berlin).
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: calendarEventTypeEnum("type").default("meeting").notNull(),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").default(false).notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /**
     * Verknüpfung mit dem Google-Kalender-Termin. Gesetzt, wenn dieser Termin
     * aus Google importiert oder von uns nach Google gepusht wurde — verhindert
     * Doppelanlage und erlaubt gezieltes Patch/Delete beim Sync.
     */
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("calendar_events_org_idx").on(t.orgId),
    index("calendar_events_start_idx").on(t.startAt),
    index("calendar_events_google_idx").on(t.googleEventId),
  ],
);

/**
 * OAuth-Verbindung zum Google-Kalender (pro Organisation genau eine).
 * Speichert die Tokens (AES-256-GCM-verschlüsselt via GOOGLE_TOKEN_SECRET),
 * den gewählten Kalender und den `syncToken` für inkrementellen Abgleich.
 */
export const googleAccounts = pgTable("google_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  calendarId: text("calendar_id").default("primary").notNull(),
  syncToken: text("sync_token"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================================
// HOOKS für spätere Phasen (Schema angelegt, in Phase 1 ungenutzt)
// ============================================================================

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: jsonb("trigger").notNull(),
    conditions: jsonb("conditions").default([]).notNull(),
    actions: jsonb("actions").default([]).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("automations_org_idx").on(t.orgId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id"),
    name: text("name").notNull(),
    type: text("type"),
    storagePath: text("storage_path").notNull(),
    linkedToType: text("linked_to_type"),
    linkedToId: uuid("linked_to_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("documents_linked_idx").on(t.linkedToType, t.linkedToId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    diff: jsonb("diff"),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_org_idx").on(t.orgId),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);

// Web-Push-Abos pro Gerät/Browser (Benachrichtigungen z. B. bei neuem Lead).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("push_subscriptions_org_idx").on(t.orgId)],
);

// VAPID-Schlüsselpaar für Web-Push — genau eine Zeile (id = 'singleton').
// Ohne Schlüssel kann der Server keine Benachrichtigung signieren. Sie liegen
// hier statt nur in Umgebungsvariablen, damit sich jede Umgebung ihr Paar beim
// ersten Aufruf selbst anlegt; niemand muss etwas in Vercel nachtragen.
// Der private Schlüssel ist ein Geheimnis, aber ein eng begrenztes: damit lassen
// sich Benachrichtigungen an angemeldete Geräte schicken — keine Daten lesen.
export const pushKeys = pgTable("push_keys", {
  id: text("id").primaryKey().default("singleton"),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  /** Kontaktadresse im VAPID-Header, z. B. "mailto:info@…". */
  subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================================
// ZEITERFASSUNG
// ============================================================================
//
// Mitarbeiter melden sich nie mit Passwort an: Das Handy wird einmalig per
// QR-Code gekoppelt (enrollment_tokens → employee_devices), danach identifiziert
// das Geräte-Cookie den Mitarbeiter. Admin ist implizit Sascha hinter dem
// APP_PASSWORD-Gate — deshalb gibt es hier keine Rollen und kein "editedBy".

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("employees_org_idx").on(t.orgId),
    uniqueIndex("employees_org_name_unique").on(t.orgId, t.name),
  ],
);

// Ein gekoppeltes Handy. Der Klartext-Token verlässt den Server nur einmal
// (als Cookie beim Einrichten) — gespeichert wird ausschließlich sein SHA-256.
export const employeeDevices = pgTable(
  "employee_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    tokenLookup: text("token_lookup").notNull().unique(),
    label: text("label"),
    userAgent: text("user_agent"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revoked: boolean("revoked").default(false).notNull(),
  },
  (t) => [
    index("employee_devices_employee_idx").on(t.employeeId),
    index("employee_devices_org_idx").on(t.orgId),
  ],
);

// Einmal-Token für die QR-Kopplung: 24 h gültig, danach verbraucht.
export const enrollmentTokens = pgTable(
  "enrollment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    tokenLookup: text("token_lookup").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumed: boolean("consumed").default(false).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("enrollment_tokens_employee_idx").on(t.employeeId)],
);

// Eine Stempelung. clockOut = null bedeutet "läuft gerade".
// Krankmeldungen liegen als fertige Einträge (08:00–16:00, sick = true) vor.
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    sick: boolean("sick").default(false).notNull(),
    wasEdited: boolean("was_edited").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("time_entries_employee_clockin_idx").on(t.employeeId, t.clockIn),
    index("time_entries_org_idx").on(t.orgId),
    // Höchstens ein laufender Eintrag pro Mitarbeiter — fängt auch den Fall ab,
    // dass zwei schnelle Taps gleichzeitig einstempeln wollen.
    uniqueIndex("time_entries_open_unique")
      .on(t.employeeId)
      .where(sql`clock_out IS NULL`),
  ],
);

// Revisionssicherer Änderungsverlauf: jede Admin-Korrektur braucht eine
// Begründung und wird pro geändertem Feld protokolliert.
//
// `timeEntryId` ist bewusst nullable mit ON DELETE SET NULL statt CASCADE:
// Würde das Protokoll am Eintrag hängen, nähme das Löschen einer Zeit ihre
// eigene Änderungsgeschichte mit — dann bliebe von einer korrigierten und
// anschließend gelöschten Zeit keinerlei Spur. Arbeitszeitnachweise sind nach
// § 16 Abs. 2 ArbZG zwei Jahre aufzubewahren, deshalb überlebt der Log-Eintrag
// den Eintrag und trägt in `entryClockIn`/`entryClockOut` eine Kopie der Werte.
//
// Am Mitarbeiter hängt der Log dagegen weiterhin per CASCADE: Wird ein
// Mitarbeiter vollständig gelöscht, sollen auch seine Protokolle verschwinden
// (Löschersuchen nach DSGVO) — die UI warnt vor genau dieser Konsequenz.
export const timeEditLogs = pgTable(
  "time_edit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    timeEntryId: uuid("time_entry_id").references(() => timeEntries.id, {
      onDelete: "set null",
    }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // "created" | "clockIn" | "clockOut" | "deleted"
    fieldChanged: text("field_changed").notNull(),
    oldValue: timestamp("old_value", { withTimezone: true }),
    newValue: timestamp("new_value", { withTimezone: true }),
    // Kopie der Eckwerte des Eintrags, damit ein gelöschter Eintrag im
    // Protokoll noch benennbar bleibt.
    entryClockIn: timestamp("entry_clock_in", { withTimezone: true }),
    entryClockOut: timestamp("entry_clock_out", { withTimezone: true }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("time_edit_logs_entry_idx").on(t.timeEntryId),
    index("time_edit_logs_employee_idx").on(t.employeeId),
  ],
);
