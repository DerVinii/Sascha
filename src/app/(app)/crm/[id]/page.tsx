import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { db } from "@/db";
import {
  contacts,
  companies,
  emailThreads,
  emailMessages,
  notes,
  activities,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { StatusPill, STATUS_LABELS } from "@/components/crm/status-pill";
import { updateContactStatusAction, deleteContactAction } from "../actions";
import type { ContactStatus } from "../actions";
import { StatusSelect } from "./_components/status-select";
import { NewNoteForm } from "./_components/new-note-form";

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
          className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink mb-3"
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
            <form action={deleteAction}>
              <button
                type="submit"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition"
                title="Kontakt löschen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Stammdaten */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Stammdaten</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Detail label="Status">
            <StatusPill status={contact.status} />
          </Detail>
          <Detail label="E-Mail">
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-info hover:underline"
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
          {contact.tags.length > 0 && (
            <div className="col-span-2">
              <dt className="text-[11px] text-sub mb-1">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-bg text-sub"
                  >
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
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
