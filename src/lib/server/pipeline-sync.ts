/**
 * Zwei-Wege-Synchronisation Ordner (lead_list) ↔ Pipeline.
 *
 * Modell: ist ein Ordner mit einer Pipeline verbunden (leadLists.pipelineId),
 * dann entspricht jedem Kontakt des Ordners genau ein Deal in der Pipeline
 * (deals.contactId). Die "Pipeline-Phase" eines Leads = die Stage seines Deals.
 *
 * Richtungen:
 *  - Ordner → Pipeline: Lead anlegen ⇒ Deal anlegen (erste Phase); Lead löschen ⇒ Deal löschen.
 *  - Pipeline → Ordner: Deal anlegen ⇒ Lead in den Ordner (nur wenn Kontakt noch
 *    keinem Ordner zugeordnet); Deal löschen ⇒ Lead komplett löschen (voll gespiegelt).
 *  - Phase ändern (Kanban ODER Zell-Dropdown) ⇒ deals.stageId; die andere Seite
 *    zeigt es beim nächsten Laden.
 *
 * Reines Modul (kein "use server"): nur DB-Operationen, keine Revalidation —
 * das erledigt der jeweilige Aufrufer (Server-Action).
 */
import { db } from "@/db";
import { leadLists, contacts, companies, deals, pipelineStages } from "@/db/schema";
import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";

// ── Verknüpfungs-Lookups ─────────────────────────────────────────────────────

/** Pipeline-ID, mit der ein Ordner verbunden ist (null = nicht verbunden). */
export async function linkedPipelineForList(
  orgId: string,
  listId: string,
): Promise<string | null> {
  const [l] = await db
    .select({ pipelineId: leadLists.pipelineId })
    .from(leadLists)
    .where(and(eq(leadLists.id, listId), eq(leadLists.orgId, orgId)))
    .limit(1);
  return l?.pipelineId ?? null;
}

/** Ordner, der mit einer Pipeline verbunden ist (null = keiner). 1:1. */
export async function linkedListForPipeline(
  orgId: string,
  pipelineId: string,
): Promise<string | null> {
  const [l] = await db
    .select({ id: leadLists.id })
    .from(leadLists)
    .where(and(eq(leadLists.orgId, orgId), eq(leadLists.pipelineId, pipelineId)))
    .limit(1);
  return l?.id ?? null;
}

/** Phasen einer Pipeline (sortiert). */
export async function pipelineStagesFor(pipelineId: string): Promise<
  { id: string; name: string; color: string | null; position: number }[]
> {
  return db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      color: pipelineStages.color,
      position: pipelineStages.position,
    })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId))
    .orderBy(asc(pipelineStages.position));
}

/** Erste Phase (kleinste position) einer Pipeline. */
async function firstStageId(pipelineId: string): Promise<string | null> {
  const [s] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId))
    .orderBy(asc(pipelineStages.position))
    .limit(1);
  return s?.id ?? null;
}

/** stageId je Kontakt für eine Pipeline (für die "Pipeline-Phase"-Spalte). */
export async function dealStageByContact(
  orgId: string,
  pipelineId: string,
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (contactIds.length === 0) return map;
  const rows = await db
    .select({ contactId: deals.contactId, stageId: deals.stageId })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        inArray(deals.contactId, contactIds),
      ),
    )
    .orderBy(asc(deals.createdAt));
  // Sollten (durch manuell angelegte Deals) mehrere Deals je Kontakt existieren,
  // gewinnt deterministisch der älteste — derselbe, den setContactDealStage bewegt.
  for (const r of rows)
    if (r.contactId && !map.has(r.contactId)) map.set(r.contactId, r.stageId);
  return map;
}

/**
 * Deal-Titel eines Leads. Der Firmenname ist – sofern vorhanden – IMMER Teil des
 * Titels: Format "Person · Firma" (bzw. "E-Mail · Firma"), oder nur "Firma", wenn
 * kein Ansprechpartner/keine E-Mail existiert. Ohne Firma greift der bisherige
 * Fallback (Person → E-Mail → "Neuer Lead").
 */
export function dealTitleFrom(c: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
}): string {
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  const company = (c.companyName ?? "").trim();
  const who = person || (c.email ?? "").trim();
  if (who && company) return `${who} · ${company}`;
  return company || who || "Neuer Lead";
}

// ── Ordner → Pipeline ────────────────────────────────────────────────────────

/**
 * Legt für die angegebenen Kontakte fehlende Deals in der Pipeline an
 * (erste Phase). Idempotent: bestehende Deals werden nicht dupliziert.
 */
export async function ensureDealsForContacts(
  orgId: string,
  pipelineId: string,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  const stageId = await firstStageId(pipelineId);
  if (!stageId) return; // Pipeline ohne Phasen — sollte nicht vorkommen.

  const existing = await db
    .select({ contactId: deals.contactId })
    .from(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        eq(deals.pipelineId, pipelineId),
        inArray(deals.contactId, contactIds),
      ),
    );
  const have = new Set(
    existing.map((d) => d.contactId).filter((x): x is string => Boolean(x)),
  );
  const missing = contactIds.filter((id) => !have.has(id));
  if (missing.length === 0) return;

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, missing)));
  if (rows.length === 0) return;

  await db.insert(deals).values(
    rows.map((r) => ({
      orgId,
      contactId: r.id,
      pipelineId,
      stageId,
      title: dealTitleFrom(r),
    })),
  );
}

/** Erst-Befüllung beim Verbinden: alle Ordner-Leads → Deals (nur Ordner → Pipeline). */
export async function backfillListToPipeline(
  orgId: string,
  listId: string,
  pipelineId: string,
): Promise<void> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.leadListId, listId)));
  await ensureDealsForContacts(
    orgId,
    pipelineId,
    rows.map((r) => r.id),
  );
}

/** Hook: Kontakte wurden einem Ordner hinzugefügt → Deals spiegeln (falls verbunden). */
export async function onContactsAddedToList(
  orgId: string,
  listId: string | null | undefined,
  contactIds: string[],
): Promise<void> {
  if (!listId || contactIds.length === 0) return;
  const pipelineId = await linkedPipelineForList(orgId, listId);
  if (!pipelineId) return;
  await ensureDealsForContacts(orgId, pipelineId, contactIds);
}

/**
 * Hook: Kontakte werden gelöscht → zugehörige Deals in verbundenen Pipelines
 * löschen (sonst blieben verwaiste Deals mit contactId=null zurück).
 * VOR dem Löschen der Kontakte aufrufen (contactIds müssen noch existieren ist
 * nicht nötig — es wird direkt über deals.contactId gelöscht).
 */
export async function deleteDealsForContacts(
  orgId: string,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  const linked = await db
    .select({ pipelineId: leadLists.pipelineId })
    .from(leadLists)
    .where(and(eq(leadLists.orgId, orgId), isNotNull(leadLists.pipelineId)));
  const pipelineIds = [
    ...new Set(
      linked.map((l) => l.pipelineId).filter((x): x is string => Boolean(x)),
    ),
  ];
  if (pipelineIds.length === 0) return;
  await db
    .delete(deals)
    .where(
      and(
        eq(deals.orgId, orgId),
        inArray(deals.contactId, contactIds),
        inArray(deals.pipelineId, pipelineIds),
      ),
    );
}

// ── Pipeline → Ordner ────────────────────────────────────────────────────────

/**
 * Hook: ein Deal wurde in einer Pipeline angelegt. Ist die Pipeline mit einem
 * Ordner verbunden UND der Kontakt gehört noch zu keinem Ordner, wird er dem
 * verbundenen Ordner zugeordnet (er erscheint dort als Lead). Kontakte, die schon
 * in einem anderen Ordner liegen, werden NICHT verschoben.
 */
export async function onDealCreated(
  orgId: string,
  contactId: string | null | undefined,
  pipelineId: string,
): Promise<void> {
  if (!contactId) return;
  const listId = await linkedListForPipeline(orgId, pipelineId);
  if (!listId) return;
  await db
    .update(contacts)
    .set({ leadListId: listId })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.orgId, orgId),
        isNull(contacts.leadListId),
      ),
    );
}

/**
 * Hook: ein Deal wurde in einer Pipeline gelöscht. Ist die Pipeline mit einem
 * Ordner verbunden UND der Kontakt liegt in diesem Ordner, wird der Lead komplett
 * gelöscht (voll gespiegelt). Kontakte aus anderen/keinen Ordnern bleiben.
 */
export async function onDealDeleted(
  orgId: string,
  contactId: string | null | undefined,
  pipelineId: string,
): Promise<void> {
  if (!contactId) return;
  const listId = await linkedListForPipeline(orgId, pipelineId);
  if (!listId) return;

  // Nur spiegeln, wenn der Lead wirklich in diesem Ordner liegt.
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.orgId, orgId),
        eq(contacts.leadListId, listId),
      ),
    )
    .limit(1);
  if (!c) return;

  // Übrige Deals des Kontakts in verbundenen Pipelines VOR dem Kontakt-Löschen
  // entfernen, sonst blieben verwaiste Deals (deals.contactId → NULL) zurück.
  await deleteDealsForContacts(orgId, [contactId]);
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
}

// ── Phase setzen (aus der "Pipeline-Phase"-Zelle) ────────────────────────────

/**
 * Setzt die Phase eines Ordner-Leads: verschiebt seinen Deal in der Pipeline auf
 * die Ziel-Stage; existiert noch kein Deal, wird einer angelegt. Aufrufer muss
 * zuvor prüfen, dass stage ∈ pipeline und pipeline mit dem Ordner des Kontakts
 * verbunden ist.
 */
export async function setContactDealStage(
  orgId: string,
  contactId: string,
  pipelineId: string,
  stageId: string,
): Promise<void> {
  const move = async (): Promise<boolean> => {
    // Genau EINEN (den ältesten/kanonischen) Deal des Leads verschieben — nicht
    // alle, falls es (durch manuell angelegte Deals) mehrere geben sollte.
    const [d] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          eq(deals.contactId, contactId),
          eq(deals.pipelineId, pipelineId),
        ),
      )
      .orderBy(asc(deals.createdAt))
      .limit(1);
    if (!d) return false;
    await db
      .update(deals)
      .set({ stageId, pipelineId })
      .where(and(eq(deals.id, d.id), eq(deals.orgId, orgId)));
    return true;
  };

  if (await move()) return;
  // Noch kein Deal — anlegen (erste Phase) und dann gezielt auf die Ziel-Stage.
  await ensureDealsForContacts(orgId, pipelineId, [contactId]);
  await move();
}
