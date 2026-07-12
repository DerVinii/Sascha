/**
 * Automatische Pipeline-Phasen für Ordner-Leads entlang des Instantly-Lebenszyklus.
 *
 * Feste Übergänge:
 *  - Lead erfolgreich in die Kampagne gepusht      → "in Kampagne"
 *  - Instantly hat eine Mail gesendet (email_sent) → "angeschrieben"
 *  - letzter Follow-up raus (campaign_completed)   → "Kampagne fertig"
 *  - Antwort, unklassifiziert oder Interessiert    → "geantwortet"
 *  - Antwort als "kein Interesse" eingestuft       → "Lost"
 *
 * Sicherheitsregeln:
 *  - Nur VORWÄRTS (Rangfolge unten): späte oder doppelte Events stufen nie
 *    zurück — z. B. verschiebt ein Follow-up-`email_sent` keinen Lead, der
 *    schon "geantwortet" hat.
 *  - Manuelle Phasen ("Termin vereinbart", "Deal", selbst angelegte) werden NIE
 *    angefasst: steht der Lead in einer Phase außerhalb der Auto-Rangfolge,
 *    ist die Automatik für ihn beendet.
 *  - Ziel-Phasen werden über ihren NAMEN gefunden (case-insensitiv). Wurde die
 *    Phase in der Pipeline umbenannt/gelöscht, passiert schlicht nichts.
 *
 * Reines Modul (kein "use server"): keine Revalidation — macht der Aufrufer.
 */
import { db } from "@/db";
import { contacts, deals, leadLists, pipelineStages } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { EMAIL_FINDER_KEY } from "@/lib/scraping-types";
import {
  ensureDealsForContacts,
  linkedPipelineForList,
} from "@/lib/server/pipeline-sync";

/** Phasen, die die Automatik kennt — nur zwischen diesen wird bewegt. */
export type AutoStageName =
  | "in Kampagne"
  | "angeschrieben"
  | "Kampagne fertig"
  | "geantwortet"
  | "Lost";

/** Rangfolge (normalisierte Namen). Bewegt wird nur von kleinerem zu größerem Rang. */
const AUTO_STAGE_RANK: Record<string, number> = {
  gescrapt: 0,
  "in kampagne": 1,
  angeschrieben: 2,
  "kampagne fertig": 3,
  geantwortet: 4,
  lost: 5,
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Verschiebt Ordner-Leads automatisch auf die Ziel-Phase — sofern der Ordner
 * mit einer Pipeline verbunden ist, die Ziel-Phase dort (per Name) existiert
 * und der jeweilige Lead aktuell in einer Auto-Phase mit KLEINEREM Rang steht.
 * Fehlende Deals werden zuvor angelegt (idempotent). Gibt die Anzahl der
 * tatsächlich bewegten Leads zurück.
 */
export async function autoAdvanceListLeads(
  orgId: string,
  listId: string,
  contactIds: string[],
  target: AutoStageName,
): Promise<number> {
  if (contactIds.length === 0) return 0;
  const pipelineId = await linkedPipelineForList(orgId, listId);
  if (!pipelineId) return 0;

  const stages = await db
    .select({ id: pipelineStages.id, name: pipelineStages.name })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId));
  const targetStage = stages.find((s) => norm(s.name) === norm(target));
  if (!targetStage) return 0;
  const targetRank = AUTO_STAGE_RANK[norm(target)];
  const rankByStageId = new Map(
    stages.map((s) => [s.id, AUTO_STAGE_RANK[norm(s.name)]]),
  );

  // Fehlende Deals anlegen (Lead evtl. vor der Pipeline-Verknüpfung entstanden).
  await ensureDealsForContacts(orgId, pipelineId, contactIds);

  const rows = await db
    .select({ id: deals.id, contactId: deals.contactId, stageId: deals.stageId })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        inArray(deals.contactId, contactIds),
      ),
    )
    .orderBy(asc(deals.createdAt));

  // Pro Kontakt zählt der älteste (kanonische) Deal — wie in dealStageByContact.
  const canonical = new Map<string, { id: string; stageId: string }>();
  for (const r of rows) {
    if (r.contactId && !canonical.has(r.contactId)) {
      canonical.set(r.contactId, { id: r.id, stageId: r.stageId });
    }
  }

  const toMove: string[] = [];
  for (const d of canonical.values()) {
    const currentRank = rankByStageId.get(d.stageId);
    // undefined = manuelle Phase → nie anfassen; sonst nur vorwärts.
    if (currentRank !== undefined && currentRank < targetRank) toMove.push(d.id);
  }
  if (toMove.length === 0) return 0;

  await db
    .update(deals)
    .set({ stageId: targetStage.id })
    .where(and(eq(deals.orgId, orgId), inArray(deals.id, toMove)));
  return toMove.length;
}

/**
 * Auto-Phase aus einem Instantly-Webhook-Event: löst die Kampagne zum Ordner
 * auf (lead_lists.instantly_campaign_id) und findet den Lead über die
 * Versand-Adresse — die ist entweder die normale E-Mail ODER die verifizierte
 * Entscheider-E-Mail (Spalte Email_Entscheider), deshalb werden beide geprüft.
 * Gibt die Anzahl bewegter Leads zurück (0 = nichts zu tun).
 */
export async function autoAdvanceByInstantlyEvent(
  orgId: string,
  instantlyCampaignId: string,
  leadEmail: string,
  target: AutoStageName,
): Promise<number> {
  const email = leadEmail.trim().toLowerCase();
  if (!email.includes("@")) return 0;

  const lists = await db
    .select({ id: leadLists.id })
    .from(leadLists)
    .where(
      and(
        eq(leadLists.orgId, orgId),
        eq(leadLists.instantlyCampaignId, instantlyCampaignId),
      ),
    );

  let moved = 0;
  for (const list of lists) {
    const matches = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.leadListId, list.id),
          sql`(lower(coalesce(${contacts.email}, '')) = ${email} OR lower(coalesce(${contacts.customFields} -> 'cells' -> ${EMAIL_FINDER_KEY} ->> 'value', '')) = ${email})`,
        ),
      );
    if (matches.length === 0) continue;
    moved += await autoAdvanceListLeads(
      orgId,
      list.id,
      matches.map((m) => m.id),
      target,
    );
  }
  return moved;
}
