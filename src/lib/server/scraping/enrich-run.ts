/**
 * Enrichment-Kernlogik — geteilt zwischen Server-Actions (Vordergrund-Runs aus
 * dem Spaltenmenü / Auswahl) und der Hintergrund-Route (/api/enrichment/run).
 *
 * Der Hintergrund-Drain verarbeitet Listen mit gesetztem `enrichmentQueuedAt`
 * server-seitig in Chargen — unabhängig davon, ob der Client noch offen ist.
 */

import { db } from "@/db";
import { contacts, companies, leadLists } from "@/db/schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  buildCells,
  cellNeedsRun,
  cellPatch,
  getColumns,
  passesOnlyRunIf,
  resolveRowPath,
  EMAIL_FINDER_KEY,
  ENRICHMENT_KEY,
  type RowSources,
} from "./lead-columns";
import { runProvider } from "./providers";
import { runAiColumn } from "./ai-column";
import {
  emailFinderImpossibleRows,
  emailFinderMissingRows,
  markEmailFinderImpossible,
  runEmailFinderPool,
} from "./reacher";
import {
  markSalutationImpossible,
  runSalutationForRow,
  salutationImpossibleRows,
  salutationMissingRows,
  SALUTATION_KEY,
} from "./salutation";
import { sendPushToOrg } from "@/lib/server/push";
import type { LeadColumn } from "@/lib/scraping-types";

export { cellPatch };

export const MAX_ROWS = 1000; // Phase-1-Cap (ein Kunde)

/**
 * Wie viele Zeilen der Hintergrund-Lauf gleichzeitig recherchiert.
 *
 * Warum überhaupt parallel: Im Rollen-Modus (z. B. Akademieleitung) liest das
 * Modell echte Standortseiten und braucht dafür 5–50 Sekunden pro Zeile —
 * gemessen an echten DAA-Daten. Nacheinander passte damit gerade noch EINE
 * Zeile in eine Etappe, und ein Ordner mit 80 Zeilen wurde nie fertig.
 *
 * Die Größe ist bewusst dieselbe wie im Vordergrund ("Fehlende ausführen",
 * dort fest auf höchstens 8) — mehr würde das Gemini-Kontingent zusätzlich
 * belasten, ohne dass es nötig wäre.
 */
export const ENRICH_CONCURRENCY = 8;

/**
 * Hartes Zeitlimit je Zeile. Zusammen mit ROW_MIN_START_MS stellt es sicher,
 * dass eine Etappe pünktlich endet: Die Route darf insgesamt nur 60 Sekunden
 * leben (maxDuration) und muss danach noch die nächste Etappe anstoßen. Genau
 * hier lag der Fehler — eine überlange Zeile ließ die Funktion ins Limit
 * laufen, der Anstoß ging verloren und der Lauf blieb stehen.
 */
const ROW_TIMEOUT_MS = 40_000;

/**
 * So viel Restzeit muss die Etappe mindestens haben, um noch eine neue Zeile
 * anzufangen. Darunter wird nichts Neues mehr begonnen — die offenen Zeilen
 * erledigt die nächste Etappe.
 */
const ROW_MIN_START_MS = 20_000;

/**
 * Nach so vielen Fehlversuchen in Folge gilt eine Zeile als erledigt
 * ("nicht gefunden") statt als Fehler. Ohne diese Grenze würde eine dauerhaft
 * scheiternde Zeile in JEDER Etappe erneut gezogen (Fehler zählen als „braucht
 * einen Lauf") und der Ordner käme nie ans Ende. Über "Alle erzwingen" lässt
 * sich eine solche Zeile jederzeit erneut versuchen.
 */
const MAX_VERSUCHE = 3;

export type RowOutcome = {
  /** "partial" = Zeitbudget innerhalb der Zeile erschöpft (nur Reacher-Spalte) —
   *  Fortschritt ist gespeichert, der nächste Aufruf setzt fort. */
  status: "success" | "not_found" | "error" | "partial";
  /** Fehler war ein Gemini-Kontingent-/Rate-Limit-Fehler (429). */
  rateLimited?: boolean;
};

/** Erkennt Gemini-429/Kontingent-Fehler an der Fehlermeldung. */
export function isRateLimitError(msg: string): boolean {
  return /\b429\b|quota|rate[ _-]?limit|RESOURCE_EXHAUSTED/i.test(msg);
}

export async function loadLeadRows(
  orgId: string,
  listId: string,
  limit = MAX_ROWS,
): Promise<RowSources[]> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      companyId: contacts.companyId,
      contactCf: contacts.customFields,
      companyName: companies.name,
      companyDomain: companies.domain,
      companyAddress: companies.address,
      companyCf: companies.customFields,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.orgId, orgId), eq(contacts.leadListId, listId)))
    .orderBy(desc(contacts.createdAt), asc(contacts.id))
    .limit(limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    contact: {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      companyId: r.companyId,
      customFields: r.contactCf ?? {},
    },
    company: r.companyId
      ? {
          name: r.companyName,
          domain: r.companyDomain,
          address: r.companyAddress ?? null,
          customFields: r.companyCf ?? {},
        }
      : null,
  }));
}

export async function runEnrichmentForRow(
  orgId: string,
  column: LeadColumn,
  src: RowSources,
  columns: LeadColumn[],
  /** keepExisting: bereits gefüllte Kontaktfelder nicht anfassen. Gesetzt, wenn
   *  der Lauf über eine andere Spalte angestoßen wurde ("Fehlende ausführen" auf
   *  E-Mail) — dann soll die Suche die Lücke schließen und nicht den Namen
   *  ersetzen, der schon dasteht. Bei "Alle erzwingen" bewusst aus.
   *  zielrolle: Zielrolle des Ordners (lead_lists.enrichment_role). Leer/null =
   *  Geschäftsführung, also exakt das bisherige Verhalten.
   *  timeoutMs: hartes Zeitlimit dieser einen Zeile (siehe ROW_TIMEOUT_MS). */
  opts?: {
    keepExisting?: boolean;
    zielrolle?: string | null;
    timeoutMs?: number;
  },
): Promise<RowOutcome> {
  // "Mit KI ausfüllen" (Claygent): freier Prompt pro Zeile, Modell fest.
  if (column.config.ai?.prompt) {
    const runAt = new Date().toISOString();
    try {
      const cellsNow = buildCells(columns, src);
      const ctx: Record<string, unknown> = {};
      for (const c of columns) {
        if (c.key === column.key) continue;
        const v = cellsNow[c.key]?.value;
        if (v !== null && v !== undefined && v !== "") ctx[c.label] = v;
      }
      const value = await runAiColumn(column.config.ai.prompt, ctx);
      const found = value.toUpperCase() !== "NF" && value.trim() !== "";
      const cell = {
        status: found ? "success" : "not_found",
        provider: "gemini",
        runAt,
        error: null,
        value: found ? value : "",
        raw: { prompt: column.config.ai.prompt, value },
      };
      await db
        .update(contacts)
        .set({ customFields: cellPatch(column.key, cell) })
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: found ? "success" : "not_found" };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Fehler";
      const cell = {
        status: "error",
        provider: null,
        runAt,
        error: message.slice(0, 300),
        value: "",
        raw: null,
      };
      await db
        .update(contacts)
        .set({ customFields: cellPatch(column.key, cell) })
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: "error", rateLimited: isRateLimitError(message) };
    }
  }

  const inputs = column.config.inputs ?? {};
  const firmenname = String(
    resolveRowPath(inputs["Firmenname"] ?? "company.name", src) ?? "",
  );
  const webseite = resolveRowPath(
    inputs["Webseite"] ?? "company.customFields.websiteUri",
    src,
  ) as string | null;
  const gmapsUrl = resolveRowPath(
    inputs["Google Maps Link"] ?? "company.customFields.googleMapsUri",
    src,
  ) as string | null;
  // Jede Zeile ist ein Google-Maps-Standort: Die Adresse grenzt im Rollen-Modus
  // ein, welcher Standort gemeint ist (ohne Zielrolle bleibt sie ungenutzt).
  const adresse = resolveRowPath("company.address.formatted", src) as
    | string
    | null;

  const chain = column.config.provider ?? ["gemini"];

  try {
    const { provider, result } = await runProvider(chain, {
      firmenname,
      webseite,
      gmapsUrl,
      adresse,
      zielrolle: opts?.zielrolle ?? null,
      timeoutMs: opts?.timeoutMs,
    });
    const runAt = new Date().toISOString();

    if (result.found) {
      const firstName =
        result.vorname.toUpperCase() === "NF" ? null : result.vorname;
      const lastName =
        result.nachname.toUpperCase() === "NF" ? null : result.nachname;
      const email =
        result.email.toUpperCase() === "NF" || !result.email.includes("@")
          ? null
          : result.email.toLowerCase();

      const cell = {
        status: "success",
        provider,
        runAt,
        error: null,
        value: [firstName, lastName].filter(Boolean).join(" ") || email || "",
        raw: { vorname: firstName, nachname: lastName, email },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set: any = { customFields: cellPatch(column.key, cell) };
      // Nur die kanonische Enrichment schreibt in die Kontakt-Felder zurück.
      // Findet der neue Lauf ein Feld nicht (NF), bleibt der alte Wert stehen:
      // Ein zweiter Lauf (z. B. "Fehlende ausführen" auf der Spalte E-Mail für
      // eine Zeile, die den Namen längst hat) darf gute Daten nicht leeren.
      if (column.key === ENRICHMENT_KEY) {
        const behalten = opts?.keepExisting === true;
        const uebernehmen = (neu: string | null, alt: string | null) =>
          behalten ? (alt ?? neu) : (neu ?? alt);
        set.firstName = uebernehmen(firstName, src.contact.firstName);
        set.lastName = uebernehmen(lastName, src.contact.lastName);
        set.email = uebernehmen(email, src.contact.email);
      }
      await db
        .update(contacts)
        .set(set)
        .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
      return { status: "success" };
    }

    const cell = {
      status: "not_found",
      provider: null,
      runAt,
      error: null,
      value: "",
      raw: { vorname: "NF", nachname: "NF", email: "NF" },
    };
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
    return { status: "not_found" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fehler";
    const rateLimited = isRateLimitError(message);

    // Fehlversuche mitzählen. Ein Kontingent-Fehler (429) zählt bewusst NICHT
    // mit: Daran ist die Zeile unschuldig, der ganze Lauf stoppt ohnehin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bisherigeZelle = (src.contact.customFields?.cells as any)?.[column.key];
    const bisher = Number(bisherigeZelle?.versuche ?? 0);
    const versuche = rateLimited ? bisher : bisher + 1;
    // Erschöpft = nicht weiter versuchen. Sonst zöge der Hintergrund-Lauf diese
    // Zeile in jeder Etappe erneut (Fehler gelten als „braucht einen Lauf")
    // und der Ordner bliebe für immer „läuft".
    const erschoepft = !rateLimited && versuche >= MAX_VERSUCHE;

    const cell = {
      status: erschoepft ? "not_found" : "error",
      provider: null,
      runAt: new Date().toISOString(),
      error: message.slice(0, 300),
      value: "",
      raw: null,
      versuche,
    };
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
    return { status: erschoepft ? "not_found" : "error", rateLimited };
  }
}

export type EnrichPoolResult = {
  /** Tatsächlich bearbeitete Zeilen (unabhängig vom Ergebnis). */
  processed: number;
  /** true = es sind Zeilen offen geblieben (Zeitbudget der Etappe erschöpft). */
  remaining: boolean;
  rateLimited: boolean;
};

/**
 * Recherchiert mehrere Zeilen gleichzeitig, bis das Zeitbudget der Etappe
 * aufgebraucht ist (gleitendes Fenster: wird eine Zeile fertig, rückt die
 * nächste nach).
 *
 * Der Kern gegen den Steckenbleib-Fehler: Es wird nur dann eine neue Zeile
 * begonnen, wenn sie im schlimmsten Fall noch VOR dem Etappenende fertig ist —
 * und jede Zeile bekommt zusätzlich ein Zeitlimit, das nie über das Etappenende
 * hinausreicht. Dadurch endet die Etappe verlässlich rechtzeitig und kann die
 * nächste anstoßen.
 */
export async function runEnrichmentPool(
  orgId: string,
  column: LeadColumn,
  rows: RowSources[],
  columns: LeadColumn[],
  opts: {
    deadline: number;
    zielrolle?: string | null;
    concurrency?: number;
  },
): Promise<EnrichPoolResult> {
  const concurrency = Math.max(1, opts.concurrency ?? ENRICH_CONCURRENCY);
  let next = 0;
  let processed = 0;
  let rateLimited = false;

  async function arbeiter(): Promise<void> {
    while (!rateLimited) {
      const rest = opts.deadline - Date.now();
      if (rest < ROW_MIN_START_MS) return; // nichts Neues mehr anfangen
      const i = next++;
      if (i >= rows.length) return;

      const outcome = await runEnrichmentForRow(orgId, column, rows[i], columns, {
        zielrolle: opts.zielrolle,
        // Nie über das Etappenende hinaus — auch nicht, wenn ROW_TIMEOUT_MS
        // theoretisch mehr erlauben würde.
        timeoutMs: Math.min(ROW_TIMEOUT_MS, rest),
      });
      processed++;
      if (outcome.rateLimited) rateLimited = true;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, arbeiter),
  );

  return { processed, remaining: next < rows.length, rateLimited };
}

/** Zeilen einer Liste, die noch angereichert werden müssen (Name leer + Run nötig). */
function missingRows(column: LeadColumn, columns: LeadColumn[], all: RowSources[]) {
  const onlyRunIf = column.config.runSettings?.onlyRunIf;
  return all.filter((src) => {
    const cell = buildCells(columns, src)[column.key];
    return cellNeedsRun(cell) && passesOnlyRunIf(onlyRunIf, src.contact);
  });
}

/**
 * Wie viele Zeilen einer Liste noch offen sind (für Status/Fortschritt).
 * Zählt alle drei Phasen: Geschäftsführer-Suche (find_dm), die Anrede und die
 * Entscheider-E-Mail-Verifizierung (email_entscheider).
 */
export async function pendingCountForList(
  orgId: string,
  listId: string,
): Promise<number> {
  const columns = await getColumns(orgId);
  const dmColumn = columns.find((c) => c.key === ENRICHMENT_KEY) ?? null;
  const anredeColumn = columns.find((c) => c.key === SALUTATION_KEY) ?? null;
  const emailColumn = columns.find((c) => c.key === EMAIL_FINDER_KEY) ?? null;
  if (!dmColumn && !anredeColumn && !emailColumn) return 0;

  const all = await loadLeadRows(orgId, listId);
  let pending = dmColumn ? missingRows(dmColumn, columns, all).length : 0;
  if (anredeColumn) {
    // Zeilen, die erst durch Phase 1 einen Namen bekommen, sind hier noch nicht
    // mitgezählt — der Wert ist eine Untergrenze und wächst im Lauf nach.
    pending += salutationMissingRows(anredeColumn, all).length;
    // Nicht befüllbare Zellen zählen mit: der Lauf erledigt sie, indem er sie
    // auf „—" setzt. Ohne sie hier zu zählen bliebe eine fertig angereicherte
    // Liste bei "nichts zu tun" stehen und würde nie markiert.
    pending += salutationImpossibleRows(anredeColumn, all).length;
  }
  if (emailColumn) {
    pending += emailFinderMissingRows(emailColumn, columns, all, null).length;
    pending += emailFinderImpossibleRows(emailColumn, columns, all).length;
  }
  return pending;
}

export type DrainSummary = {
  processedRows: number;
  anyRemaining: boolean; // es gibt noch offene Arbeit -> Chain fortsetzen
  rateLimited: boolean;
  /** Umgebungsproblem (z. B. Reacher-Secret fehlt / Prüfserver tot): Der Lauf
   *  pausiert, die Liste bleibt eingereiht und die Kette wird NICHT weiter
   *  gedreht — sonst würde sie im Sekundentakt ins Leere feuern. */
  configError?: string | null;
};

/** Wie lange gilt eine Liste als „von einem lebenden Worker bearbeitet". */
export const ENRICH_STALE_MS = 3 * 60 * 1000;

/**
 * Push-Meldung zum Ende eines Recherche-Laufs. Best-effort: ein Fehler beim
 * Benachrichtigen darf den Drain nie stoppen — die Zeilen sind längst gespeichert.
 */
async function meldeRecherche(
  list: { id: string; orgId: string },
  meldung: { title: string; body: string },
): Promise<void> {
  try {
    await sendPushToOrg(list.orgId, {
      ...meldung,
      url: `/vertrieb/scraping?list=${list.id}`,
      tag: `enrich-${list.id}`,
      event: "recherche",
    });
  } catch (err) {
    console.error("[enrich] Push fehlgeschlagen", err);
  }
}

/**
 * Verarbeitet Listen mit gesetztem enrichmentQueuedAt server-seitig in Chargen,
 * bis das Zeitbudget erschöpft ist. `isContinuation` = true bei Self-Chain-Hops
 * (immer weiterarbeiten); false bei Cron/Erst-Kick (nur „tote" Läufe aufnehmen).
 */
export async function drainQueuedLists(opts: {
  budgetMs: number;
  isContinuation: boolean;
}): Promise<DrainSummary> {
  const start = Date.now();
  const deadline = start + opts.budgetMs;
  let processedRows = 0;
  let anyRemaining = false;
  let rateLimited = false;
  let configError: string | null = null;

  const queued = await db
    .select({
      id: leadLists.id,
      orgId: leadLists.orgId,
      name: leadLists.name,
      tickAt: leadLists.enrichmentTickAt,
      queuedAt: leadLists.enrichmentQueuedAt,
      // Zielrolle des Ordners — steuert nur Phase 1 (Entscheider-Suche).
      zielrolle: leadLists.enrichmentRole,
    })
    .from(leadLists)
    .where(isNotNull(leadLists.enrichmentQueuedAt))
    .orderBy(asc(leadLists.enrichmentQueuedAt));

  for (const list of queued) {
    // Cron/Erst-Kick: aktive Chains (frischer Tick) nicht doppeln. Bewusst OHNE
    // anyRemaining=true — die laufende Chain kümmert sich selbst, ein zusätzlicher
    // Continuation-Hop von hier würde die Verarbeitung verdoppeln.
    if (!opts.isContinuation) {
      const fresh =
        list.tickAt && Date.now() - list.tickAt.getTime() < ENRICH_STALE_MS;
      if (fresh) continue;
    }
    if (Date.now() >= deadline) {
      anyRemaining = true;
      break;
    }

    // Tick setzen (Heartbeat + Sperre gegen Cron-Doppelung).
    await db
      .update(leadLists)
      .set({ enrichmentTickAt: new Date() })
      .where(eq(leadLists.id, list.id));

    const columns = await getColumns(list.orgId);
    const dmColumn = columns.find((c) => c.key === ENRICHMENT_KEY) ?? null;
    const anredeColumn = columns.find((c) => c.key === SALUTATION_KEY) ?? null;
    const emailColumn =
      columns.find((c) => c.key === EMAIL_FINDER_KEY) ?? null;
    if (!dmColumn && !anredeColumn && !emailColumn) {
      // Keine Engine-Spalte -> Liste aus der Queue nehmen.
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
      continue;
    }

    // true = diese Liste hat noch offene Arbeit (Budget erschöpft).
    let listRemaining = false;
    // Nur für die Push-Meldung: hat dieser Hop für die Liste überhaupt etwas
    // getan? Sonst käme ein „fertig" auch für Listen, bei denen nichts anlag.
    const bereitsVerarbeitet = processedRows;

    // --- Phase 1: Entscheider finden (Gemini) ------------------------------
    // Mehrere Zeilen gleichzeitig (runEnrichmentPool): Im Rollen-Modus dauert
    // eine Zeile 5–50 s, nacheinander würde ein großer Ordner nie fertig.
    if (dmColumn) {
      const all = await loadLeadRows(list.orgId, list.id);
      const missing = missingRows(dmColumn, columns, all);

      const pool = await runEnrichmentPool(list.orgId, dmColumn, missing, columns, {
        deadline,
        zielrolle: list.zielrolle,
      });
      processedRows += pool.processed;
      if (pool.rateLimited) rateLimited = true;
      else if (pool.remaining) listRemaining = true;
    }

    // --- Phase 1.5: Anrede formulieren (Gemini, fester Prompt) -------------
    // Läuft erst, wenn Phase 1 für die Liste durch ist — vorher stünden die
    // Namen noch nicht in der Zeile. Und VOR Phase 2, weil die E-Mail-Prüfung
    // das ganze Zeitbudget schlucken kann und die Anrede sonst nie drankäme.
    if (anredeColumn && !rateLimited && !listRemaining) {
      const all = await loadLeadRows(list.orgId, list.id);

      // Zeilen ohne Namen können nie eine Anrede bekommen. Sichtbar auf „—"
      // setzen, sonst stehen sie dauerhaft leer da und wirken wie „noch nicht
      // dran" — und „Fehlende ausführen" würde sie immer wieder mitnehmen.
      const unmoeglich = salutationImpossibleRows(anredeColumn, all);
      let markiert = 0;
      for (; markiert < unmoeglich.length; markiert++) {
        if (Date.now() >= deadline) break;
        await markSalutationImpossible(
          list.orgId,
          anredeColumn,
          unmoeglich[markiert].src,
          unmoeglich[markiert].grund,
        );
      }
      if (markiert < unmoeglich.length) listRemaining = true;

      const todo = salutationMissingRows(anredeColumn, all);

      let i = 0;
      for (; i < todo.length; i++) {
        if (Date.now() >= deadline) break;
        const outcome = await runSalutationForRow(
          list.orgId,
          anredeColumn,
          todo[i],
        );
        processedRows++;
        if (outcome.error && isRateLimitError(outcome.error)) {
          rateLimited = true;
          break;
        }
      }
      if (i < todo.length && !rateLimited) listRemaining = true;
    }

    // --- Phase 2: Entscheider-E-Mail verifizieren (Reacher) -----------------
    // Startet automatisch, sobald Phase 1 für die Liste komplett durch ist —
    // aber nur für Zeilen mit Vorname + Nachname + Webseite. Zeilen werden
    // frisch geladen, weil Phase 1 gerade Namen zurückgeschrieben hat.
    if (emailColumn && !rateLimited && !listRemaining) {
      const all = await loadLeadRows(list.orgId, list.id);

      // Gleiches Prinzip wie bei der Anrede: fehlt Name oder Webseite, kann
      // diese Zeile nie geprüft werden -> sichtbar „—" statt Dauer-Leerstand.
      // Läuft NACH Phase 1, die Namen also schon geschrieben hat.
      const unmoeglich = emailFinderImpossibleRows(emailColumn, columns, all);
      let markiert = 0;
      for (; markiert < unmoeglich.length; markiert++) {
        if (Date.now() >= deadline) break;
        await markEmailFinderImpossible(
          list.orgId,
          emailColumn,
          unmoeglich[markiert].src,
          unmoeglich[markiert].grund,
        );
      }
      if (markiert < unmoeglich.length) listRemaining = true;

      const todo = emailFinderMissingRows(
        emailColumn,
        columns,
        all,
        list.queuedAt,
      );
      // Sliding-Window-Pool: bis zu EMAIL_FINDER_CONCURRENCY Zeilen gleichzeitig.
      // Rückt eine Zeile weg (fertig/partial), zieht der Pool sofort die nächste,
      // bis das Zeitbudget für eine neue Zeile nicht mehr reicht. Teil-Läufe
      // sichern ihren Fortschritt selbst und laufen im nächsten Hop weiter.
      const pool = await runEmailFinderPool(list.orgId, emailColumn, todo, {
        deadline,
      });
      processedRows += pool.results.length;
      if (pool.remaining) listRemaining = true;
      if (pool.abortReason) configError = pool.abortReason;
    }

    // Heartbeat nachziehen.
    await db
      .update(leadLists)
      .set({ enrichmentTickAt: new Date() })
      .where(eq(leadLists.id, list.id));

    const verarbeitet = processedRows - bereitsVerarbeitet;

    if (rateLimited) {
      // Kontingent erschöpft: Lauf abbrechen (Client-Neustart nötig).
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
      await meldeRecherche(list, {
        title: "Lead-Recherche gestoppt",
        body: `${list.name}: KI-Kontingent aufgebraucht${
          verarbeitet > 0 ? ` (${verarbeitet} Zeilen geschafft)` : ""
        }`,
      });
      break;
    }
    if (configError) {
      // Liste bleibt bewusst eingereiht (enrichmentQueuedAt unangetastet): Es
      // liegt an der Umgebung, nicht an den Leads. Der nächste Cron-Lauf oder
      // ein „Update cells" nimmt sie unverändert wieder auf. Kette NICHT
      // fortsetzen — jeder Hop würde sofort wieder abbrechen.
      await meldeRecherche(list, {
        title: "Lead-Recherche pausiert",
        body: `${list.name}: E-Mail-Prüfung gerade nicht möglich — keine Zeile wurde als Fehler markiert.`,
      });
      break;
    }
    if (listRemaining) {
      anyRemaining = true; // Budget erschöpft, Zeilen offen
    } else {
      // Beide Phasen fertig -> Liste aus der Queue nehmen.
      await db
        .update(leadLists)
        .set({ enrichmentQueuedAt: null })
        .where(eq(leadLists.id, list.id));
      if (verarbeitet > 0) {
        await meldeRecherche(list, {
          title: "Lead-Recherche fertig",
          body: `${list.name}: ${verarbeitet} ${
            verarbeitet === 1 ? "Zeile" : "Zeilen"
          } bearbeitet`,
        });
      }
    }
  }

  return { processedRows, anyRemaining, rateLimited, configError };
}
