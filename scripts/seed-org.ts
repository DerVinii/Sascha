/**
 * Seed-Skript für die fixe Org "SK Kommandozentrale".
 *
 * Die Anmeldung wurde aus der App entfernt — es gibt keinen Auth-User und
 * keine Mitgliedschaften mehr. Die App nutzt einfach die erste Organisation
 * in der Datenbank. Dieses Skript stellt sicher, dass genau eine Org samt
 * Standard-Pipeline existiert.
 *
 * Was es macht (idempotent — beliebig oft ausführbar):
 *  1. Prüft, ob Org "SK Kommandozentrale" existiert → legt sie sonst an
 *  2. Legt Standard-Pipeline + 6 Stages an, falls noch nicht vorhanden
 *
 * Aufruf:
 *   npm run seed
 *
 * Voraussetzung:
 *   .env.local muss DATABASE_URL enthalten.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/db/schema";

const ORG_NAME = "SK Kommandozentrale";

const DEFAULT_STAGES = [
  { name: "Lead", position: 0, probability: 10, color: "#fef3c7" },
  { name: "Qualified", position: 1, probability: 25, color: "#dbeafe" },
  { name: "In Conversation", position: 2, probability: 40, color: "#dbeafe" },
  { name: "Termin gebucht", position: 3, probability: 60, color: "#fed7aa" },
  { name: "Closed Won", position: 4, probability: 100, color: "#d1fae5" },
  { name: "Closed Lost", position: 5, probability: 0, color: "#fee2e2" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL fehlt in .env.local");

  const client = postgres(databaseUrl, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    // 1. Org finden oder anlegen
    let orgId: string;
    const existingOrg = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.name, ORG_NAME))
      .limit(1);

    if (existingOrg[0]) {
      orgId = existingOrg[0].id;
      console.log(`✅ Org "${ORG_NAME}" existiert bereits: ${orgId}`);
    } else {
      const [created] = await db
        .insert(schema.organizations)
        .values({ name: ORG_NAME })
        .returning({ id: schema.organizations.id });
      orgId = created.id;
      console.log(`🆕 Org angelegt: ${orgId}`);
    }

    // 2. Standard-Pipeline + Stages
    const existingPipeline = await db
      .select({ id: schema.pipelines.id })
      .from(schema.pipelines)
      .where(
        and(
          eq(schema.pipelines.orgId, orgId),
          eq(schema.pipelines.isDefault, true),
        ),
      )
      .limit(1);

    if (existingPipeline[0]) {
      console.log(
        `✅ Standard-Pipeline existiert bereits: ${existingPipeline[0].id}`,
      );
    } else {
      const [pipeline] = await db
        .insert(schema.pipelines)
        .values({
          orgId,
          name: "Standard-Pipeline",
          isDefault: true,
        })
        .returning({ id: schema.pipelines.id });

      await db.insert(schema.pipelineStages).values(
        DEFAULT_STAGES.map((s) => ({
          pipelineId: pipeline.id,
          name: s.name,
          position: s.position,
          probability: s.probability,
          color: s.color,
        })),
      );
      console.log(`🆕 Standard-Pipeline + ${DEFAULT_STAGES.length} Stages angelegt.`);
    }

    console.log(`\n✨ Seed abgeschlossen. Org "${ORG_NAME}" ist einsatzbereit.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Seed fehlgeschlagen:", err);
  process.exit(1);
});
