/**
 * "Email_Entscheider"-Engine: findet die echte E-Mail-Adresse des Entscheiders,
 * indem Namens-Varianten (vorname.nachname@domain, v.nachname@domain, …) gegen
 * den selbst gehosteten Reacher-Server (Live-SMTP-Prüfung) getestet werden, bis
 * eine Variante `is_reachable == "safe"` liefert — der Nachbau des früheren
 * n8n-Workflows "find Emails".
 *
 * Wichtige Eigenschaften:
 * - Sequenziell mit ~1 Anfrage/Sekunde (Reacher-Empfehlung, sonst drosseln
 *   Gmail/Outlook die Server-IP und alles wird `unknown`).
 * - Eine Zeile kann 20–40 SMTP-Checks brauchen (> Serverless-Zeitbudget), daher
 *   wird der Fortschritt nach JEDEM Check in der Zelle gespeichert (`finder`)
 *   und beim nächsten Aufruf/Hop nahtlos fortgesetzt (status "running").
 * - Catch-All-Domains und Domains ohne Mail-Empfang werden nach dem ersten
 *   Check erkannt und sofort abgebrochen (alle weiteren Checks wären sinnlos).
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  buildCells,
  cellPatch,
  passesOnlyRunIf,
  resolveRowPath,
  type RowSources,
} from "./lead-columns";
import type { LeadCell, LeadColumn } from "@/lib/scraping-types";

// ----------------------------------------------------------------------------
// Reacher-API-Client
// ----------------------------------------------------------------------------

const DEFAULT_REACHER_URL = "http://23.160.161.55:8080/v0/check_email";

/** Timeout pro SMTP-Check. Reacher empfiehlt 60 s, aber im Serverless-Budget
 *  (45 s pro Hop) sind 15 s der Kompromiss — langsame Server werden als
 *  `unknown` verbucht und blockieren den Lauf nicht. */
const CHECK_TIMEOUT_MS = 15_000;
/** Pause zwischen zwei Checks (~1 Anfrage/Sekunde, Reacher-Empfehlung). */
const SPACING_MS = 1_100;
/** So viel Restzeit muss übrig sein, um noch einen Check zu starten. */
const CHECK_HEADROOM_MS = CHECK_TIMEOUT_MS + 1_000;
/** Mindest-Restbudget, um eine NEUE Zeile überhaupt anzufangen (Drain). */
export const EMAIL_FINDER_MIN_ROW_MS = 20_000;

/**
 * Wie viele Leads gleichzeitig gesucht werden (Sliding-Window-Pool). Jede Zeile
 * prüft ihre ~21 Varianten weiterhin sequenziell mit Abstand (SPACING_MS) — der
 * Abstand schützt EINE Domain vor Rapid-Fire. Die Parallelität liegt ZWISCHEN
 * den Zeilen (i. d. R. verschiedene Domains), es sind also stets bis zu 10
 * Suchen aktiv; wird eine fertig, rückt sofort die nächste nach.
 */
export const EMAIL_FINDER_CONCURRENCY = 10;

/** Konfigurations-/Auth-Fehler — sofort abbrechen, Wiederholen bringt nichts. */
class ReacherConfigError extends Error {}

export const REACHER_SECRET_FEHLT =
  "REACHER_SECRET ist nicht gesetzt — Umgebungsvariable in Vercel/.env.local hinterlegen.";

/** Vorabprüfung, bevor ein Lauf auch nur eine Zelle anfasst. */
export function reacherKonfiguriert(): boolean {
  return !!process.env.REACHER_SECRET;
}

type ReacherVerdict = {
  reachable: "safe" | "risky" | "invalid" | "unknown";
  /** Domain nimmt alles an → Varianten-Test nicht aussagekräftig. */
  catchAll: boolean;
  /** mx.accepts_mail — false = Domain empfängt generell keine Mails. */
  mxOk: boolean | null;
  /** Check lief in den Timeout (zählt als unknown). */
  timedOut?: boolean;
};

export async function checkEmail(email: string): Promise<ReacherVerdict> {
  const url = process.env.REACHER_API_URL || DEFAULT_REACHER_URL;
  const secret = process.env.REACHER_SECRET;
  if (!secret) throw new ReacherConfigError(REACHER_SECRET_FEHLT);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-reacher-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: email }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.status === 400) {
      throw new ReacherConfigError(
        "Reacher-Server lehnt ab (HTTP 400) — REACHER_SECRET fehlt oder ist falsch.",
      );
    }
    if (!res.ok) throw new Error(`Reacher HTTP ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await res.json();
    const reachable = ["safe", "risky", "invalid", "unknown"].includes(
      d?.is_reachable,
    )
      ? d.is_reachable
      : "unknown";
    return {
      reachable,
      catchAll: d?.smtp?.is_catch_all === true,
      mxOk:
        typeof d?.mx?.accepts_mail === "boolean" ? d.mx.accepts_mail : null,
    };
  } catch (e) {
    // Timeout = unknown (weiter mit der nächsten Variante); echte Netz-/HTTP-
    // Fehler nach oben durchreichen (der Runner bricht die Zeile dann ab).
    // Kein instanceof Error: der Abort wirft eine DOMException.
    const name = (e as { name?: string } | null)?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      return { reachable: "unknown", catchAll: false, mxOk: null, timedOut: true };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------------------
// E-Mail-Varianten (1:1 aus dem alten n8n-Workflow, plus Härtung)
// ----------------------------------------------------------------------------

function resolveUmlauts(s: string): string {
  return s
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/** Namensteil → gültiger E-Mail-Local-Part-Baustein (klein, ASCII, ohne Leerzeichen). */
function sanitizeNamePart(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // é→e, à→a …
    .replace(/[^a-z0-9-]/g, ""); // Leerzeichen, Punkte, Sonderzeichen raus
}

/** Die 21 Varianten-Muster des alten Workflows, nach Wahrscheinlichkeit sortiert. */
function generateVariants(vn: string, nn: string): string[] {
  const vi = vn.charAt(0);
  const ni = nn.charAt(0);
  if (!vi || !ni) return [];
  return [
    `${vn}.${nn}`,
    `${vi}.${nn}`,
    `${vn}`,
    `${nn}`,
    `${vn}-${nn}`,
    `${vi}${nn}`,
    `${vn}${nn}`,
    `${vn}.${ni}`,
    `${vi}${ni}`,
    `${nn}.${vn}`,
    `${vn}_${nn}`,
    `${vi}-${nn}`,
    `${nn}${vi}`,
    `${nn}${vn}`,
    `${nn}.${vi}`,
    `${ni}.${vn}`,
    `${vi}.${ni}`,
    `${vn}-${ni}`,
    `${ni}-${vn}`,
    `${nn}-${vn}`,
    `${nn}_${vn}`,
  ];
}

/** Webseite → Mail-Domain (Protokoll/www./Pfad weg; IDN → Punycode via URL). */
export function extractEmailDomain(website: string): string | null {
  let s = (website ?? "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      // Wurzel-Punkt am Ende ("beispiel.de." — kommt aus getippten Webseiten-
      // Feldern): Reacher findet dafür keine MX-Records und meldet die Domain
      // fälschlich als „empfängt keine E-Mails".
      .replace(/\.+$/, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** Plattform-Domains: dort existieren nie Firmen-Postfächer — 21 Checks sparen. */
const PLATFORM_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "xing.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "google.com",
  "goo.gl",
  "whatsapp.com",
  "wa.me",
  "t.me",
  "yelp.de",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.de",
  "booking.com",
  "ebay.de",
  "amazon.de",
  "kleinanzeigen.de",
  "gelbeseiten.de",
  "dastelefonbuch.de",
  "11880.com",
];

function isPlatformDomain(domain: string): boolean {
  return PLATFORM_DOMAINS.some((b) => domain === b || domain.endsWith(`.${b}`));
}

/**
 * Alle Kandidaten-Adressen für einen Lead. Umlaut-Namen erzeugen beide üblichen
 * Schreibweisen (müller → mueller UND muller); Reihenfolge = Wahrscheinlichkeit.
 */
export function candidateEmails(
  vorname: string,
  nachname: string,
  domain: string,
): string[] {
  const forms: [string, string][] = [];
  const push = (v: string, n: string) => {
    const sv = sanitizeNamePart(v);
    const sn = sanitizeNamePart(n);
    if (sv && sn && !forms.some(([a, b]) => a === sv && b === sn))
      forms.push([sv, sn]);
  };
  const vLow = vorname.toLowerCase();
  const nLow = nachname.toLowerCase();
  push(resolveUmlauts(vLow), resolveUmlauts(nLow)); // ü→ue (DACH-Standard)
  push(vLow, nLow); // ü→u (NFKD-Fallback), ohne Umlaute identisch → dedupe

  const variants: string[] = [];
  for (const [v, n] of forms) variants.push(...generateVariants(v, n));
  return [...new Set(variants)].map((local) => `${local}@${domain}`);
}

// ----------------------------------------------------------------------------
// Zeilen-Auswahl (welche Leads bekommen den Workflow?)
// ----------------------------------------------------------------------------

function finderInputs(column: LeadColumn, src: RowSources) {
  const inputs = column.config.inputs ?? {};
  const read = (key: string, fallback: string) => {
    const v = resolveRowPath(inputs[key] ?? fallback, src);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    vorname: read("Vorname", "contact.firstName"),
    nachname: read("Nachname", "contact.lastName"),
    webseite: read("Webseite", "company.customFields.websiteUri"),
  };
}

/** Nur Leads mit Vorname + Nachname + Webseite bekommen den Workflow. */
export function emailFinderReady(column: LeadColumn, src: RowSources): boolean {
  const { vorname, nachname, webseite } = finderInputs(column, src);
  return !!(vorname && nachname && webseite);
}

/** Zelle braucht (noch) einen Lauf: leer, Fehler oder unterbrochener Teil-Lauf. */
export function emailFinderCellNeedsRun(cell: LeadCell): boolean {
  return (
    cell.status === "empty" ||
    cell.status === "error" ||
    cell.status === "running"
  );
}

/**
 * Offene Zeilen für den Hintergrund-Drain. `queuedAt` begrenzt auf „in diesem
 * Lauf noch nicht versucht" (Fehler-Zeilen werden nicht endlos wiederholt,
 * solange derselbe Lauf aktiv ist); unterbrochene Teil-Läufe ("running") haben
 * immer Vorrang und werden zuerst fortgesetzt.
 */
export function emailFinderMissingRows(
  column: LeadColumn,
  columns: LeadColumn[],
  all: RowSources[],
  queuedAt: Date | null,
): RowSources[] {
  const onlyRunIf = column.config.runSettings?.onlyRunIf;
  const decorated: { src: RowSources; running: boolean }[] = [];

  for (const src of all) {
    if (!emailFinderReady(column, src)) continue;
    if (!passesOnlyRunIf(onlyRunIf, src.contact)) continue;
    const cell = buildCells(columns, src)[column.key];
    if (!cell || !emailFinderCellNeedsRun(cell)) continue;
    const running = cell.status === "running";
    if (!running && queuedAt) {
      const runAt = cell.runAt ? Date.parse(cell.runAt) : NaN;
      if (Number.isFinite(runAt) && runAt >= queuedAt.getTime()) continue;
    }
    decorated.push({ src, running });
  }

  return decorated
    .sort((a, b) => Number(b.running) - Number(a.running))
    .map((d) => d.src);
}

// ----------------------------------------------------------------------------
// Runner (eine Zeile, fortsetzbar)
// ----------------------------------------------------------------------------

export type EmailFinderOutcome = {
  /** "aborted" = Umgebungsproblem (Secret fehlt, Prüfserver nicht erreichbar).
   *  Die Zelle bleibt unangetastet, damit der Lead nicht dauerhaft als Fehler
   *  dasteht — ein späterer Lauf holt ihn nach. */
  status: "success" | "not_found" | "error" | "partial" | "aborted";
  /** nur bei "aborted": woran die Umgebung scheiterte. */
  reason?: string;
};

/** In der Zelle gespeicherter Fortschritt (unsichtbar fürs Grid/den Drawer). */
type FinderState = {
  sig: string; // Vorname|Nachname|Domain — bei Änderung neu starten
  candidates: string[];
  next: number;
  tried: Record<string, string>; // email -> is_reachable
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runEmailFinderForRow(
  orgId: string,
  column: LeadColumn,
  src: RowSources,
  opts: { deadline: number; restart?: boolean },
): Promise<EmailFinderOutcome> {
  const persist = async (cell: Record<string, unknown>) => {
    await db
      .update(contacts)
      .set({ customFields: cellPatch(column.key, cell) })
      .where(and(eq(contacts.id, src.contact.id), eq(contacts.orgId, orgId)));
  };

  const finish = async (
    status: "success" | "not_found" | "error",
    data: {
      value?: string;
      error?: string | null;
      hinweis?: string;
      state?: FinderState | null;
      domain?: string | null;
    },
  ): Promise<EmailFinderOutcome> => {
    const state = data.state ?? null;
    await persist({
      status,
      provider: "reacher",
      runAt: new Date().toISOString(),
      error: data.error ?? null,
      value: data.value ?? "",
      raw: {
        email: data.value ?? null,
        domain: data.domain ?? state?.sig.split("|")[2] ?? null,
        getestet: state ? Object.keys(state.tried).length : 0,
        varianten: state ? state.candidates.length : 0,
        ...(data.hinweis ? { hinweis: data.hinweis } : {}),
      },
      ...(state ? { finder: state } : {}),
    });
    return { status };
  };

  /**
   * Umgebungsproblem statt Lead-Problem (Secret fehlt, Prüfserver antwortet
   * nicht). Die Zelle wird bewusst NICHT auf "Fehler" gesetzt: Am Lead ist
   * nichts falsch, die Prüfung war nur gerade nicht möglich. Ein Fehler-Status
   * würde die Zeile dauerhaft rot färben, die Liste als „fertig" aus der
   * Warteschlange nehmen und niemand würde es je wieder versuchen.
   * Angefangene Varianten werden als Teil-Lauf gesichert und später fortgesetzt.
   */
  const abbrechen = async (
    reason: string,
    state: FinderState | null,
    domain: string | null,
  ): Promise<EmailFinderOutcome> => {
    if (state && state.next > 0) {
      await persist({
        status: "running",
        provider: "reacher",
        runAt: new Date().toISOString(),
        error: null,
        value: "",
        raw: {
          email: null,
          domain,
          getestet: Object.keys(state.tried).length,
          varianten: state.candidates.length,
        },
        finder: state,
      });
    }
    return { status: "aborted", reason };
  };

  const { vorname, nachname, webseite } = finderInputs(column, src);
  if (!vorname || !nachname || !webseite) {
    return finish("error", {
      error:
        "Vorname, Nachname und Webseite werden benötigt, um E-Mail-Varianten zu testen.",
    });
  }

  const domain = extractEmailDomain(webseite);
  if (!domain) {
    return finish("not_found", {
      hinweis: `Webseite „${webseite}" ergibt keine gültige Domain.`,
      domain: null,
    });
  }
  if (isPlatformDomain(domain)) {
    return finish("not_found", {
      hinweis: `Plattform-Domain (${domain}) — dort gibt es keine Firmen-Postfächer.`,
      domain,
    });
  }

  // Fortschritt aus der Zelle laden bzw. frisch aufsetzen.
  const sig = `${vorname.toLowerCase()}|${nachname.toLowerCase()}|${domain}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storedCell = (src.contact.customFields?.cells as any)?.[column.key];
  const stored = storedCell?.finder as FinderState | undefined;
  let state: FinderState;
  if (
    !opts.restart &&
    stored &&
    stored.sig === sig &&
    Array.isArray(stored.candidates) &&
    typeof stored.next === "number"
  ) {
    state = {
      sig,
      candidates: stored.candidates,
      next: Math.max(0, Math.min(stored.next, stored.candidates.length)),
      tried: stored.tried ?? {},
    };
  } else {
    state = { sig, candidates: candidateEmails(vorname, nachname, domain), next: 0, tried: {} };
  }

  if (state.candidates.length === 0) {
    return finish("not_found", {
      hinweis: "Aus dem Namen ließen sich keine gültigen E-Mail-Varianten bilden.",
      domain,
    });
  }

  let consecutiveErrors = 0;

  while (state.next < state.candidates.length) {
    // Reicht die Zeit noch für einen Check? Sonst Fortschritt sichern und beim
    // nächsten Hop/Aufruf nahtlos weitermachen.
    if (Date.now() + CHECK_HEADROOM_MS > opts.deadline) {
      await persist({
        status: "running",
        provider: "reacher",
        runAt: new Date().toISOString(),
        error: null,
        value: "",
        raw: {
          email: null,
          domain,
          getestet: Object.keys(state.tried).length,
          varianten: state.candidates.length,
        },
        finder: state,
      });
      return { status: "partial" };
    }

    const email = state.candidates[state.next];
    let verdict: ReacherVerdict;
    try {
      verdict = await checkEmail(email);
      consecutiveErrors = 0;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Reacher-Fehler";
      consecutiveErrors++;
      if (e instanceof ReacherConfigError || consecutiveErrors >= 2) {
        // Falsches/fehlendes Secret oder Server nicht erreichbar: den ganzen
        // Lauf abbrechen, ohne die Zeile als Fehler zu markieren. Der
        // Fortschritt bleibt erhalten, der nächste Lauf setzt genau hier an.
        return abbrechen(message.slice(0, 300), state, domain);
      }
      state.tried[email] = "unknown";
      state.next++;
      await sleep(SPACING_MS);
      continue;
    }

    state.tried[email] = verdict.timedOut ? "unknown" : verdict.reachable;
    state.next++;

    // Domain-Eigenschaften: gelten für ALLE Varianten → sofort abbrechen.
    if (verdict.mxOk === false) {
      return finish("not_found", {
        hinweis: `Domain ${domain} empfängt keine E-Mails (keine MX-Records).`,
        state,
        domain,
      });
    }
    if (verdict.catchAll) {
      return finish("not_found", {
        hinweis: `Catch-All-Domain (${domain}) — Adress-Varianten lassen sich nicht verifizieren.`,
        state,
        domain,
      });
    }

    if (verdict.reachable === "safe") {
      return finish("success", { value: email, state, domain });
    }

    // Fortschritt nach jedem Check sichern — übersteht harte Function-Kills.
    await persist({
      status: "running",
      provider: "reacher",
      runAt: new Date().toISOString(),
      error: null,
      value: "",
      raw: {
        email: null,
        domain,
        getestet: Object.keys(state.tried).length,
        varianten: state.candidates.length,
      },
      finder: state,
    });

    if (state.next < state.candidates.length) await sleep(SPACING_MS);
  }

  const unknowns = Object.values(state.tried).filter(
    (v) => v === "unknown",
  ).length;
  return finish("not_found", {
    hinweis:
      `Alle ${state.candidates.length} Varianten geprüft — keine zustellbare Adresse gefunden.` +
      (unknowns > 0 ? ` (${unknowns} ohne eindeutiges Ergebnis)` : ""),
    state,
    domain,
  });
}

// ----------------------------------------------------------------------------
// Sliding-Window-Pool (mehrere Zeilen gleichzeitig)
// ----------------------------------------------------------------------------

export type EmailFinderPoolResult = {
  /** Ergebnis je tatsächlich begonnener Zeile (inkl. "partial"). */
  results: { src: RowSources; outcome: EmailFinderOutcome }[];
  /** true = es ist noch Arbeit offen (Teil-Lauf ODER nicht begonnene Zeilen). */
  remaining: boolean;
  /** Gesetzt, wenn die Umgebung den Lauf verhindert hat (Secret fehlt,
   *  Prüfserver nicht erreichbar). Dann wurde KEINE Zelle als Fehler markiert
   *  und alle Zeilen sind weiterhin offen. */
  abortReason?: string | null;
};

/**
 * Verarbeitet Leads mit einem Sliding-Window-Pool: es sind stets bis zu
 * `concurrency` Suchen gleichzeitig aktiv. Sobald eine Zeile fertig ist
 * (Treffer, kein Treffer oder Fehler), zieht derselbe Worker sofort die nächste
 * offene Zeile — so bleiben durchgehend `concurrency` Suchen in Arbeit, ohne auf
 * die langsamste Zeile einer Charge zu warten.
 *
 * Gestoppt wird, wenn `rows` erschöpft ist oder das Restbudget für eine NEUE
 * Zeile nicht mehr reicht (`EMAIL_FINDER_MIN_ROW_MS`). Bereits laufende Zeilen
 * sichern bei Zeitablauf selbst ihren Fortschritt ("partial") und werden beim
 * nächsten Aufruf/Hop fortgesetzt.
 *
 * `restart` kann pro Zeile entschieden werden (Prädikat) — nötig, weil ein
 * expliziter Zell-Run auf einer fertigen Zelle neu startet, ein Teil-Lauf aber
 * fortgesetzt wird.
 */
export async function runEmailFinderPool(
  orgId: string,
  column: LeadColumn,
  rows: RowSources[],
  opts: {
    deadline: number;
    concurrency?: number;
    restart?: boolean | ((src: RowSources) => boolean);
  },
): Promise<EmailFinderPoolResult> {
  const concurrency = Math.max(1, opts.concurrency ?? EMAIL_FINDER_CONCURRENCY);
  const results: { src: RowSources; outcome: EmailFinderOutcome }[] = [];
  let idx = 0;
  let remaining = false;
  let abortReason: string | null = null;

  // Fehlt das Secret, scheitert JEDE Zeile am ersten Check. Das einmal vorab
  // prüfen, statt die Liste zeilenweise mit Fehlern zu überziehen.
  if (rows.length > 0 && !reacherKonfiguriert()) {
    return { results, remaining: true, abortReason: REACHER_SECRET_FEHLT };
  }

  const worker = async () => {
    for (;;) {
      // Umgebung defekt: keine weitere Zeile anfassen.
      if (abortReason) {
        if (idx < rows.length) remaining = true;
        return;
      }
      // Nur eine neue Zeile beginnen, wenn genug Restbudget da ist.
      if (Date.now() >= opts.deadline - EMAIL_FINDER_MIN_ROW_MS) {
        if (idx < rows.length) remaining = true;
        return;
      }
      // idx++ ist synchron → in JS' Single-Thread-Modell bekommt jede Zeile
      // genau einen Worker (keine Doppelverarbeitung).
      const i = idx++;
      if (i >= rows.length) return;
      const src = rows[i];
      const restart =
        typeof opts.restart === "function" ? opts.restart(src) : opts.restart;
      const outcome = await runEmailFinderForRow(orgId, column, src, {
        deadline: opts.deadline,
        restart,
      });
      if (outcome.status === "aborted") {
        // Zeile ist unverändert offen geblieben — nicht als erledigt zählen.
        abortReason = outcome.reason ?? "Prüfserver nicht erreichbar.";
        remaining = true;
        return;
      }
      results.push({ src, outcome });
      if (outcome.status === "partial") remaining = true;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()),
  );

  return { results, remaining, abortReason };
}
