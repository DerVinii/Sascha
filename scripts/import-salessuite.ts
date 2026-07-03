/**
 * Einmaliger Import der SalesSuite-Exporte in die SK-Kommandozentrale.
 *
 * Bildet Saschas SalesSuite 1:1 ab:
 *   - 4 Pipelines: Sponsoren, Pädagogische Angebote, AsA-Flex, Setter / Closer
 *   - 149 Kontakte (aus "Alle Kontekte.csv") inkl. Firmen
 *   - 129 Deals (6 in AsA-Flex/Anfrage, 123 in Setter/Closer) in den richtigen Phasen
 *
 * Idempotent (beliebig oft ausführbar):
 *   - Kontakte per E-Mail dedupliziert
 *   - Firmen per Name dedupliziert
 *   - Deals per (Pipeline + Kontakt + Deal-Name) dedupliziert
 *
 * Aufruf:   npm run import:salessuite
 * Voraussetzung: .env.local mit DATABASE_URL; die 3 CSVs liegen im Projekt-Root.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { resolve } from "path";
import Papa from "papaparse";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, asc, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const { organizations, companies, contacts, pipelines, pipelineStages, deals } =
  schema;

type Row = Record<string, string>;

// ── CSV-/Wert-Helfer ────────────────────────────────────────────────────────

function readCsv(file: string): Row[] {
  const raw = readFileSync(resolve(process.cwd(), file), "utf-8").replace(
    /^﻿/,
    "",
  );
  const res = Papa.parse<Row>(raw, { header: true, skipEmptyLines: true });
  return res.data;
}

const g = (r: Row, k: string): string => (r[k] ?? "").trim();
const orNull = (s: string): string | null => (s ? s : null);

function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseEur(s: string): number | null {
  if (!s) return null;
  const n = Number(
    s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."),
  );
  return isNaN(n) ? null : Math.round(n);
}

function buildAddress(r: Row): Record<string, string | null> | null {
  const street = g(r, "Kontakt: Adresse");
  const zip = g(r, "Kontakt: Postleitzahl");
  const city = g(r, "Kontakt: Stadt");
  const country = g(r, "Kontakt: Land");
  const state = g(r, "Kontakt: Bundesland");
  if (!street && !zip && !city && !country && !state) return null;
  return {
    street: street || null,
    zip: zip || null,
    city: city || null,
    country: country || null,
    state: state || null,
  };
}

// ── Pipeline-/Phasen-Definitionen (Reihenfolge wie in SalesSuite) ───────────

const PIPELINE_DEFS: { name: string; stages: string[]; note?: string }[] = [
  {
    name: "Sponsoren",
    stages: ["Anfrage", "Nachverfolgung", "Erstgespräch", "Verkauft", "Nicht verkauft"],
    note: "Phasen geschätzt (0 Deals im Export)",
  },
  {
    name: "Pädagogische Angebote",
    stages: ["Anfrage", "Nachverfolgung", "Erstgespräch", "Verkauft", "Nicht verkauft"],
    note: "Phasen geschätzt (0 Deals im Export)",
  },
  {
    name: "AsA-Flex",
    stages: [
      "Anfrage",
      "Nachverfolgung",
      "Erstgespräch",
      "Qualifiziert ohne Termin",
      "Verkauft",
    ],
  },
  {
    name: "Setter / Closer",
    stages: [
      "Anfrage eingegangen",
      "Nachverfolgung",
      "Qualifiziert (ohne Termin)",
      "Erstgespräch",
      "Folgegespräch",
      "Verkauft",
      "Nicht verkauft",
      "Unqualifizert",
    ],
  },
];

const STAGE_COLORS = [
  "#fef3c7",
  "#dbeafe",
  "#e0e7ff",
  "#fed7aa",
  "#fde68a",
  "#d1fae5",
  "#fee2e2",
  "#f1f5f9",
];

function stageColor(name: string, idx: number): string {
  const n = name.toLowerCase();
  if (n.includes("nicht verkauft")) return "#fee2e2";
  if (n.includes("unqualifiz")) return "#f1f5f9";
  if (n.includes("verkauft")) return "#d1fae5";
  return STAGE_COLORS[idx % STAGE_COLORS.length];
}

// ── Hauptlauf ───────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt in .env.local");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    // Org auflösen (wie getActiveOrg: ACTIVE_ORG_ID oder älteste Org)
    const fixedId = process.env.ACTIVE_ORG_ID;
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(fixedId ? eq(organizations.id, fixedId) : undefined)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    if (!org) throw new Error("Keine Organisation gefunden — erst `npm run seed`.");
    console.log(`Organisation: ${org.name} (${org.id})\n`);

    // 1) Pipelines + Phasen sicherstellen
    const pipelineId = new Map<string, string>();
    const stageId = new Map<string, Map<string, string>>();

    for (const def of PIPELINE_DEFS) {
      const [existing] = await db
        .select({ id: pipelines.id })
        .from(pipelines)
        .where(and(eq(pipelines.orgId, org.id), eq(pipelines.name, def.name)))
        .limit(1);
      let pid = existing?.id;
      if (!pid) {
        const [ins] = await db
          .insert(pipelines)
          .values({ orgId: org.id, name: def.name })
          .returning({ id: pipelines.id });
        pid = ins.id;
      }
      pipelineId.set(def.name, pid);

      const have = await db
        .select({ id: pipelineStages.id, name: pipelineStages.name })
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, pid));
      const byName = new Map(have.map((s) => [s.name, s.id]));
      const sm = new Map<string, string>();
      for (let i = 0; i < def.stages.length; i++) {
        const sname = def.stages[i];
        let sid = byName.get(sname);
        if (!sid) {
          const [si] = await db
            .insert(pipelineStages)
            .values({
              pipelineId: pid,
              name: sname,
              position: i,
              color: stageColor(sname, i),
            })
            .returning({ id: pipelineStages.id });
          sid = si.id;
        }
        sm.set(sname, sid);
      }
      stageId.set(def.name, sm);
      console.log(
        `Pipeline "${def.name}": ${def.stages.length} Phasen bereit${
          def.note ? ` — ${def.note}` : ""
        }`,
      );
    }

    // 2) Firmen-Cache + getOrCreate
    const companyCache = new Map<string, string>();
    async function getCompanyId(
      name: string,
      domain: string | null,
      address: Record<string, string | null> | null,
    ): Promise<string | null> {
      if (!name) return null;
      const key = name.toLowerCase();
      const cached = companyCache.get(key);
      if (cached) return cached;
      const [ex] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, org.id), eq(companies.name, name)))
        .limit(1);
      let id = ex?.id;
      if (!id) {
        const [ins] = await db
          .insert(companies)
          .values({ orgId: org.id, name, domain, address })
          .returning({ id: companies.id });
        id = ins.id;
      }
      companyCache.set(key, id);
      return id;
    }

    // 3) Kontakt-Cache + getOrCreate (aus einer beliebigen Export-Zeile)
    const contactByEmail = new Map<string, string>();
    async function getOrCreateContact(r: Row): Promise<string | null> {
      const email = g(r, "Primärer Ansprechpartner: E-Mail").toLowerCase();
      if (!email) return null;
      const cached = contactByEmail.get(email);
      if (cached) return cached;
      const [ex] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, org.id), eq(contacts.email, email)))
        .limit(1);
      if (ex) {
        contactByEmail.set(email, ex.id);
        return ex.id;
      }
      const companyId = await getCompanyId(
        g(r, "Kontakt: Firmenname"),
        orNull(g(r, "Kontakt: Website") || g(r, "Kontakt: Webseite")),
        buildAddress(r),
      );
      const [ins] = await db
        .insert(contacts)
        .values({
          orgId: org.id,
          companyId,
          firstName: orNull(g(r, "Primärer Ansprechpartner: Vorname")),
          lastName: orNull(g(r, "Primärer Ansprechpartner: Nachname")),
          email,
          phone: orNull(g(r, "Primärer Ansprechpartner: Telefon")),
          source: orNull(g(r, "Kontakt: Leadherkunft")),
          lastContactAt: parseDate(
            g(r, "Kontakt: Kontakt zuletzt kontaktiert am"),
          ),
          createdAt: parseDate(g(r, "Kontakt: Erstellt am")),
        })
        .returning({ id: contacts.id });
      contactByEmail.set(email, ins.id);
      return ins.id;
    }

    // 4) Alle Kontakte importieren
    let cNew = 0;
    let cSkip = 0;
    for (const r of readCsv("Alle Kontekte.csv")) {
      const email = g(r, "Primärer Ansprechpartner: E-Mail").toLowerCase();
      if (!email) continue;
      const before = contactByEmail.has(email);
      const existed = before
        ? true
        : Boolean(
            (
              await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(
                  and(eq(contacts.orgId, org.id), eq(contacts.email, email)),
                )
                .limit(1)
            )[0],
          );
      await getOrCreateContact(r);
      if (existed) cSkip++;
      else cNew++;
    }
    console.log(`\nKontakte: ${cNew} neu angelegt, ${cSkip} schon vorhanden.`);

    // 5) Deals importieren
    async function importDeals(file: string, pipelineName: string) {
      const pid = pipelineId.get(pipelineName)!;
      const sm = stageId.get(pipelineName)!;
      const def = PIPELINE_DEFS.find((p) => p.name === pipelineName)!;
      const firstStageId = sm.get(def.stages[0])!;
      let dNew = 0;
      let dSkip = 0;
      let warn = 0;
      for (const r of readCsv(file)) {
        const contactId = await getOrCreateContact(r);
        const phase = g(r, "Deal: Phase");
        let sid = sm.get(phase);
        if (!sid) {
          sid = firstStageId;
          warn++;
          console.warn(`  ! Unbekannte Phase "${phase}" → erste Phase`);
        }
        const title = orNull(g(r, "Deal: Deal-Name")) ?? pipelineName;

        const [ex] = await db
          .select({ id: deals.id })
          .from(deals)
          .where(
            and(
              eq(deals.orgId, org.id),
              eq(deals.pipelineId, pid),
              eq(deals.title, title),
              contactId ? eq(deals.contactId, contactId) : isNull(deals.contactId),
            ),
          )
          .limit(1);
        if (ex) {
          dSkip++;
          continue;
        }

        await db.insert(deals).values({
          orgId: org.id,
          contactId,
          pipelineId: pid,
          stageId: sid,
          title,
          valueEur: parseEur(g(r, "Deal: Auftrags-Volumen")),
          expectedClose: parseDate(g(r, "Deal: Abschluss-Datum")) ?? null,
          createdAt: parseDate(g(r, "Deal: Deal erstellt am")),
        });
        dNew++;
      }
      console.log(
        `Deals "${pipelineName}": ${dNew} neu, ${dSkip} schon vorhanden${
          warn ? `, ${warn} Phasen-Warnungen` : ""
        }.`,
      );
    }

    await importDeals("ASA-Flex I Anfrage.csv", "AsA-Flex");
    await importDeals("Setter _ Closer I Alle.csv", "Setter / Closer");

    // 6) Leere Seed-"Standard-Pipeline" entfernen (SalesSuite hat sie nicht)
    const [std] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(
        and(
          eq(pipelines.orgId, org.id),
          eq(pipelines.name, "Standard-Pipeline"),
        ),
      )
      .limit(1);
    if (std) {
      const [{ c }] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(deals)
        .where(eq(deals.pipelineId, std.id));
      if (c === 0) {
        await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, std.id));
        await db.delete(pipelines).where(eq(pipelines.id, std.id));
        console.log(`\nLeere "Standard-Pipeline" entfernt.`);
      } else {
        console.log(`\n"Standard-Pipeline" hat ${c} Deals → bleibt erhalten.`);
      }
    }

    console.log(`\n✨ Import abgeschlossen.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Import fehlgeschlagen:", err);
  process.exit(1);
});
