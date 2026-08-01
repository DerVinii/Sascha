import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import {
  contacts,
  companies,
  emailThreads,
  emailMessages,
  notes,
  activities,
  pipelines,
  pipelineStages,
  deals,
  tags,
} from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { getOrgSettings } from "@/lib/server/org-settings";
import {
  parseContactFieldDefs,
  parseContactFieldValues,
} from "@/lib/contact-fields";
import { StatusPill, STATUS_LABELS } from "@/components/crm/status-pill";
import { updateContactStatusAction, deleteContactAction } from "../actions";
import { formatEur } from "@/lib/pipeline-templates";

export const dynamic = "force-dynamic";
import type { ContactStatus } from "../actions";
import { StatusSelect } from "./_components/status-select";
import { NewNoteForm } from "./_components/new-note-form";
import { DeleteContactButton } from "./_components/delete-contact-button";
import { CustomFieldsEditor } from "./_components/custom-fields-editor";
import { TagsEditor } from "./_components/tags-editor";
import { NewDealModal } from "../_components/new-deal-modal";

function formatDateTime(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireActiveOrg();

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      status: contacts.status,
      source: contacts.source,
      tags: contacts.tags,
      customFields: contacts.customFields,
      lastContactAt: contacts.lastContactAt,
      createdAt: contacts.createdAt,
      companyId: contacts.companyId,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.id, id), eq(contacts.orgId, org.id)))
    .limit(1);

  if (!contact) notFound();

  // Individuelle Felder (Definitionen der Org + Werte dieses Kontakts) & Tags
  const [orgSettings, orgTags] = await Promise.all([
    getOrgSettings(org.id),
    db
      .select({ name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.orgId, org.id))
      .orderBy(asc(tags.name)),
  ]);
  const fieldDefs = parseContactFieldDefs(orgSettings);
  const fieldValues = parseContactFieldValues(contact.customFields);

  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "(ohne Namen)";

  // Mail-Threads + Messages
  const threads = await db
    .select({
      id: emailThreads.id,
      subject: emailThreads.subject,
      lastMessageAt: emailThreads.lastMessageAt,
    })
    .from(emailThreads)
    .where(eq(emailThreads.contactId, id))
    .orderBy(desc(emailThreads.lastMessageAt));

  const messages = threads.length
    ? await db
        .select({
          id: emailMessages.id,
          threadId: emailMessages.threadId,
          direction: emailMessages.direction,
          subject: emailMessages.subject,
          bodyText: emailMessages.bodyText,
          sentAt: emailMessages.sentAt,
          autoTag: emailMessages.autoTag,
        })
        .from(emailMessages)
        .where(
          eq(
            emailMessages.threadId,
            threads[0]?.id ?? "00000000-0000-0000-0000-000000000000",
          ),
        )
        .orderBy(desc(emailMessages.sentAt))
        .limit(20)
    : [];

  // Notizen
  const contactNotes = await db
    .select()
    .from(notes)
    .where(eq(notes.contactId, id))
    .orderBy(desc(notes.createdAt))
    .limit(50);

  // Aktivitäten
  const contactActivities = await db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .orderBy(desc(activities.createdAt))
    .limit(50);

  // Deals dieses Kontakts (mit Pipeline + Phase)
  const contactDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      valueEur: deals.valueEur,
      expectedClose: deals.expectedClose,
      pipelineId: deals.pipelineId,
      pipelineName: pipelines.name,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
    })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(eq(deals.contactId, id), eq(deals.orgId, org.id)))
    .orderBy(desc(deals.createdAt));

  // Pipelines + Phasen für das "Deal anlegen"-Modal
  const orgPipelines = await db
    .select({
      id: pipelines.id,
      name: pipelines.name,
      isDefault: pipelines.isDefault,
    })
    .from(pipelines)
    .where(eq(pipelines.orgId, org.id))
    .orderBy(desc(pipelines.isDefault), asc(pipelines.createdAt));

  const orgStages = await db
    .select({
      id: pipelineStages.id,
      name: pipelineStages.name,
      pipelineId: pipelineStages.pipelineId,
    })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .where(eq(pipelines.orgId, org.id))
    .orderBy(asc(pipelineStages.position));

  const pipelinesWithStages = orgPipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: orgStages
      .filter((s) => s.pipelineId === p.id)
      .map((s) => ({ id: s.id, name: s.name })),
  }));
  const defaultPipeline = pipelinesWithStages[0];

  async function deleteAction() {
    "use server";
    await deleteContactAction(id);
  }

  async function changeStatus(status: ContactStatus) {
    "use server";
    await updateContactStatusAction(id, status);
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink mb-3 py-2 -mt-2 md:py-0 md:mt-0"
        >
          <ChevronLeft className="h-3 w-3" />
          Alle Kontakte
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink truncate">
              {fullName}
            </h1>
            <p className="text-sm text-sub mt-0.5">
              {contact.companyName ?? "Keine Firma"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusSelect
              current={contact.status}
              onChange={changeStatus}
            />
            <DeleteContactButton
              contactName={fullName}
              deleteAction={deleteAction}
            />
          </div>
        </div>
      </div>

      {/* Stammdaten */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Stammdaten</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Detail label="Status">
            <StatusPill status={contact.status} />
          </Detail>
          <Detail label="E-Mail">
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-info hover:underline break-all"
              >
                {contact.email}
              </a>
            ) : (
              "—"
            )}
          </Detail>
          <Detail label="Telefon">
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="text-info hover:underline">
                {contact.phone}
              </a>
            ) : (
              "—"
            )}
          </Detail>
          <Detail label="Quelle">{contact.source ?? "—"}</Detail>
          <Detail label="Letzter Kontakt">
            {formatDateTime(contact.lastContactAt)}
          </Detail>
          <Detail label="Angelegt">{formatDateTime(contact.createdAt)}</Detail>
          <div className="sm:col-span-2">
            <dt className="text-[11px] text-sub mb-1">Tags</dt>
            <dd>
              <TagsEditor
                contactId={id}
                tags={contact.tags}
                orgTags={orgTags}
              />
            </dd>
          </div>
        </dl>
      </div>

      {/* Individuelle Felder */}
      {fieldDefs.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold mb-3">Individuelle Felder</h2>
          <CustomFieldsEditor
            contactId={id}
            defs={fieldDefs}
            values={fieldValues}
          />
        </div>
      )}

      {/* Deals */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Deals</h2>
          {defaultPipeline ? (
            <NewDealModal
              pipelines={pipelinesWithStages}
              lockedContact={{
                id: contact.id,
                name: fullName,
                companyName: contact.companyName,
              }}
              defaultPipelineId={defaultPipeline.id}
              defaultStageId={defaultPipeline.stages[0]?.id}
            />
          ) : (
            <Link
              href="/pipelines"
              className="text-xs text-info hover:underline"
            >
              Erst Pipeline anlegen
            </Link>
          )}
        </div>
        {contactDeals.length === 0 ? (
          <p className="text-sm text-sub py-4">
            Noch keine Deals für diesen Kontakt.
          </p>
        ) : (
          <ul className="space-y-2">
            {contactDeals.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/pipelines/${d.pipelineId}`}
                  className="flex items-center justify-between gap-3 border border-line rounded-lg p-3 hover:bg-bg transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {d.title}
                    </div>
                    <div className="text-[11px] text-sub mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className="pill"
                        style={{
                          background: d.stageColor ?? "#e2e8f0",
                          color: "#0f172a",
                        }}
                      >
                        {d.stageName}
                      </span>
                      <span>· {d.pipelineName}</span>
                      {d.expectedClose && (
                        <span>
                          · Abschluss{" "}
                          {new Intl.DateTimeFormat("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(d.expectedClose)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-ink whitespace-nowrap">
                    {formatEur(d.valueEur)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mail-Historie */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Mail-Historie</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-sub py-4">
            Noch keine Nachrichten. E-Mail-Versand & Tracking kommt in Phase 2.
          </p>
        ) : (
          <ul className="divide-y divide-line -mx-5">
            {messages.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 ${
                      m.direction === "in"
                        ? "bg-info/10 text-info"
                        : "bg-ok/10 text-ok"
                    }`}
                  >
                    {m.direction === "in" ? "Eingang" : "Ausgang"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {m.subject ?? "(kein Betreff)"}
                    </div>
                    <div className="text-xs text-sub mt-0.5 line-clamp-2">
                      {m.bodyText ?? "—"}
                    </div>
                    <div className="text-[11px] text-sub mt-1 flex items-center gap-2">
                      <span>{formatDateTime(m.sentAt)}</span>
                      {m.autoTag && (
                        <span className="pill bg-bg text-sub">
                          {m.autoTag}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notizen */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Notizen</h2>
        <NewNoteForm contactId={id} />
        {contactNotes.length === 0 ? (
          <p className="text-sm text-sub py-4">Noch keine Notizen.</p>
        ) : (
          <ul className="space-y-2 mt-3">
            {contactNotes.map((n) => (
              <li
                key={n.id}
                className="border border-line rounded-lg p-3 bg-bg/30"
              >
                <p className="text-sm whitespace-pre-wrap text-ink">
                  {n.body}
                </p>
                <p className="text-[11px] text-sub mt-1.5">
                  {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Aktivitäten */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Aktivitäten</h2>
        {contactActivities.length === 0 ? (
          <p className="text-sm text-sub py-4">
            Aufgaben und Termine kommen mit dem Aufgaben-Modul (Chunk 5).
          </p>
        ) : (
          <ul className="space-y-2">
            {contactActivities.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 text-sm"
              >
                <span className="text-[10px] uppercase pill bg-bg text-sub">
                  {a.type}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-[11px] text-sub">
                    {formatDateTime(a.dueDate)}
                  </div>
                </div>
                {a.completedAt && (
                  <span className="text-[10px] text-ok">✓ erledigt</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] text-sub mb-0.5">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
