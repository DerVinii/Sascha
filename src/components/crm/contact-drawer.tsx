"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Mail, Trash2, ExternalLink, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/components/crm/status-pill";
import type {
  ContactFieldDef,
  ContactFieldValue,
} from "@/lib/contact-fields";
import { readableTextColor, formatEur } from "@/lib/pipeline-templates";
import {
  getContactDetailAction,
  updateContactCoreAction,
  updateContactStatusAction,
  updateContactTagsAction,
  updateContactFieldValueAction,
  bulkDeleteContactsAction,
  type ContactDrawerDetail,
  type ContactStatus,
} from "@/app/(app)/crm/actions";

const INPUT =
  "w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ---------------------------------------------------------------------------
// Kontext: erlaubt jeder Zeile/Karte, das Panel über die Kontakt-ID zu öffnen.
// ---------------------------------------------------------------------------

type DrawerCtx = { open: (contactId: string) => void };
const ContactDrawerContext = createContext<DrawerCtx | null>(null);

export function useContactDrawer(): DrawerCtx {
  const ctx = useContext(ContactDrawerContext);
  if (!ctx)
    throw new Error(
      "useContactDrawer muss innerhalb von <ContactDrawerProvider> genutzt werden.",
    );
  return ctx;
}

export function ContactDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [contactId, setContactId] = useState<string | null>(null);
  const open = useCallback((id: string) => setContactId(id), []);

  return (
    <ContactDrawerContext.Provider value={{ open }}>
      {children}
      {contactId && (
        <ContactDrawer
          contactId={contactId}
          onClose={() => setContactId(null)}
        />
      )}
    </ContactDrawerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Das eigentliche Einschiebe-Panel (rechts auf Desktop, unten auf Mobile).
// Lädt seine Daten selbst über die Kontakt-ID → identisch aus Kontakten &
// Pipelines nutzbar.
// ---------------------------------------------------------------------------

function ContactDrawer({
  contactId,
  onClose,
}: {
  contactId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [detail, setDetail] = useState<ContactDrawerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  // Wurde etwas geändert? Dann beim Schließen die Tabelle im Hintergrund
  // aktualisieren.
  const dirtyRef = useRef(false);

  // Enter-Animation erst nach dem ersten Paint anstoßen.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hintergrund-Scroll sperren, solange das Panel offen ist.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Daten laden (auch bei Wechsel auf einen anderen Kontakt).
  useEffect(() => {
    setDetail(null);
    setError(null);
    startLoad(async () => {
      try {
        setDetail(await getContactDetailAction(contactId));
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Kontakt konnte nicht geladen werden.",
        );
      }
    });
  }, [contactId]);

  const close = useCallback(() => {
    setShown(false);
    if (dirtyRef.current) router.refresh();
    window.setTimeout(onClose, 300);
  }, [onClose, router]);

  // ESC schließt das Panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  function writeEmail(email: string) {
    // Navigation zum Postfach — kein Refresh der aktuellen Seite nötig.
    router.push(`/postfach?compose=${encodeURIComponent(email)}`);
  }

  const fullName = detail
    ? [detail.firstName, detail.lastName].filter(Boolean).join(" ") ||
      "(ohne Namen)"
    : "";

  return (
    <>
      {/* Abdunkelnder Hintergrund */}
      <div
        onClick={close}
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-300",
          shown ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Kontaktdetails"
        className={cn(
          "fixed z-50 bg-surface shadow-2xl flex flex-col transition-transform duration-300 ease-out",
          // Mobile: Bottom-Sheet
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl",
          // Desktop: rechtes Einschiebefenster
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:bottom-auto sm:h-dvh sm:w-[480px] sm:max-h-none sm:rounded-t-none",
          shown
            ? "translate-y-0 sm:translate-x-0"
            : "translate-y-full sm:translate-y-0 sm:translate-x-full",
        )}
      >
        {/* Kopf */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink truncate">
              {detail ? fullName : "Kontakt"}
            </h2>
            {detail && (
              <p className="text-xs text-sub mt-0.5 truncate">
                {detail.companyName ?? "Keine Firma"}
              </p>
            )}
          </div>
          <button
            onClick={close}
            aria-label="Schließen"
            className="h-9 w-9 -mr-1 shrink-0 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading && !detail ? (
            <div className="p-10 text-center text-sm text-sub">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
              Kontakt wird geladen …
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-sm text-err">
                {error}
              </div>
            </div>
          ) : detail ? (
            <DrawerBody
              key={detail.id}
              detail={detail}
              onWriteEmail={writeEmail}
              onDeleted={() => {
                dirtyRef.current = true;
                close();
              }}
              onDirty={() => {
                dirtyRef.current = true;
              }}
              patchDetail={(p) =>
                setDetail((d) => (d ? { ...d, ...p } : d))
              }
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}

type BodyProps = {
  detail: ContactDrawerDetail;
  onWriteEmail: (email: string) => void;
  onDeleted: () => void;
  onDirty: () => void;
  patchDetail: (patch: Partial<ContactDrawerDetail>) => void;
};

function DrawerBody({
  detail,
  onWriteEmail,
  onDeleted,
  onDirty,
  patchDetail,
}: BodyProps) {
  return (
    <div className="p-4 sm:p-5 space-y-5">
      {/* Aktionen */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.email && (
          <button
            onClick={() => onWriteEmail(detail.email as string)}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition"
          >
            <Mail className="h-4 w-4" />
            E-Mail schreiben
          </button>
        )}
        <Link
          href={`/crm/${detail.id}`}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line text-sub hover:text-ink hover:bg-bg text-sm font-medium transition"
        >
          <ExternalLink className="h-4 w-4" />
          Vollständige Ansicht
        </Link>
        <div className="flex-1" />
        <DeleteButton contactId={detail.id} onDeleted={onDeleted} />
      </div>

      <StammdatenSection
        detail={detail}
        onDirty={onDirty}
        patchDetail={patchDetail}
      />
      <TagsSection detail={detail} onDirty={onDirty} patchDetail={patchDetail} />
      {detail.fieldDefs.length > 0 && (
        <CustomFieldsSection
          detail={detail}
          onDirty={onDirty}
          patchDetail={patchDetail}
        />
      )}
      <DealsSection deals={detail.deals} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-sub mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ----- Stammdaten (Status + Kernfelder, Inline-Speichern) -------------------

function StammdatenSection({
  detail,
  onDirty,
  patchDetail,
}: {
  detail: ContactDrawerDetail;
  onDirty: () => void;
  patchDetail: (patch: Partial<ContactDrawerDetail>) => void;
}) {
  const [core, setCore] = useState({
    firstName: detail.firstName ?? "",
    lastName: detail.lastName ?? "",
    email: detail.email ?? "",
    phone: detail.phone ?? "",
    companyName: detail.companyName ?? "",
    source: detail.source ?? "",
  });
  const savedRef = useRef(core);
  const [, startSave] = useTransition();
  const [saving, setSaving] = useState(false);

  function saveCore() {
    const keys = Object.keys(core) as (keyof typeof core)[];
    const changed = keys.some(
      (k) => core[k].trim() !== (savedRef.current[k] ?? "").trim(),
    );
    if (!changed) return;
    savedRef.current = { ...core };

    const payload = {
      firstName: core.firstName.trim() || null,
      lastName: core.lastName.trim() || null,
      email: core.email.trim() || null,
      phone: core.phone.trim() || null,
      source: core.source.trim() || null,
      companyName: core.companyName.trim() || null,
    };
    // Kopf & E-Mail-Button sofort aktualisieren.
    patchDetail(payload);
    onDirty();
    setSaving(true);
    startSave(async () => {
      try {
        await updateContactCoreAction(detail.id, payload);
      } finally {
        setSaving(false);
      }
    });
  }

  function set<K extends keyof typeof core>(key: K, value: string) {
    setCore((c) => ({ ...c, [key]: value }));
  }

  return (
    <Section title="Stammdaten">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <Labeled label="Status">
          <select
            value={detail.status}
            onChange={(e) => {
              const status = e.target.value as ContactStatus;
              patchDetail({ status });
              onDirty();
              startSave(async () => {
                await updateContactStatusAction(detail.id, status);
              });
            }}
            className={INPUT}
          >
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Firma">
          <input
            value={core.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            onBlur={saveCore}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="Vorname">
          <input
            value={core.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            onBlur={saveCore}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="Nachname">
          <input
            value={core.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            onBlur={saveCore}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="E-Mail">
          <input
            type="email"
            value={core.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={saveCore}
            placeholder="name@firma.de"
            className={INPUT}
          />
        </Labeled>
        <Labeled label="Telefon">
          <input
            type="tel"
            value={core.phone}
            onChange={(e) => set("phone", e.target.value)}
            onBlur={saveCore}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="Quelle">
          <input
            value={core.source}
            onChange={(e) => set("source", e.target.value)}
            onBlur={saveCore}
            className={INPUT}
          />
        </Labeled>
      </div>
      {saving && <p className="text-[11px] text-sub mt-2">Speichert …</p>}
    </Section>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-sub mb-1">{label}</label>
      {children}
    </div>
  );
}

// ----- Tags -----------------------------------------------------------------

function TagsSection({
  detail,
  onDirty,
  patchDetail,
}: {
  detail: ContactDrawerDetail;
  onDirty: () => void;
  patchDetail: (patch: Partial<ContactDrawerDetail>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [, startSave] = useTransition();
  const tags = detail.tags;

  const colorFor = (name: string) =>
    detail.orgTags.find((t) => t.name === name)?.color ?? "#e2e8f0";
  const available = detail.orgTags.filter((t) => !tags.includes(t.name));

  function save(next: string[]) {
    setOpen(false);
    patchDetail({ tags: next });
    onDirty();
    startSave(async () => {
      await updateContactTagsAction(detail.id, next);
    });
  }

  return (
    <Section title="Tags">
      <div className="relative flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="pill"
            style={{ background: colorFor(t), color: readableTextColor(colorFor(t)) }}
          >
            {t}
            <button
              onClick={() => save(tags.filter((x) => x !== t))}
              className="p-1.5 -m-1 inline-flex items-center justify-center hover:opacity-60"
              aria-label={`Tag ${t} entfernen`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="pill min-h-[32px] px-2 bg-bg text-sub border border-line hover:text-ink hover:border-sub transition"
          >
            <Plus className="h-3 w-3" />
            Tag
          </button>
          {open && (
            <div className="absolute z-10 top-full mt-1 left-0 bg-surface border border-line rounded-md p-1.5 shadow-lg w-48">
              {available.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-sub">
                  {detail.orgTags.length === 0
                    ? "Noch keine Tags angelegt."
                    : "Alle Tags sind bereits zugewiesen."}
                </p>
              ) : (
                available.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => save([...tags, t.name])}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-ink rounded hover:bg-bg text-left"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-line shrink-0"
                      style={{ background: t.color ?? "#e2e8f0" }}
                    />
                    {t.name}
                  </button>
                ))
              )}
              <Link
                href="/einstellungen/tags"
                className="block px-2 py-1.5 text-[11px] text-sub hover:text-ink border-t border-line mt-1"
              >
                Tags verwalten →
              </Link>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

// ----- Individuelle Felder --------------------------------------------------

function CustomFieldsSection({
  detail,
  onDirty,
  patchDetail,
}: {
  detail: ContactDrawerDetail;
  onDirty: () => void;
  patchDetail: (patch: Partial<ContactDrawerDetail>) => void;
}) {
  const [, startSave] = useTransition();

  function save(key: string, value: ContactFieldValue) {
    patchDetail({ fieldValues: { ...detail.fieldValues, [key]: value } });
    onDirty();
    startSave(async () => {
      await updateContactFieldValueAction(detail.id, key, value);
    });
  }

  return (
    <Section title="Individuelle Felder">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {detail.fieldDefs.map((def) => (
          <FieldInput
            key={`${def.key}:${String(detail.fieldValues[def.key] ?? "")}`}
            def={def}
            value={detail.fieldValues[def.key] ?? null}
            onSave={(v) => save(def.key, v)}
          />
        ))}
      </div>
    </Section>
  );
}

function FieldInput({
  def,
  value,
  onSave,
}: {
  def: ContactFieldDef;
  value: ContactFieldValue;
  onSave: (v: ContactFieldValue) => void;
}) {
  let input: React.ReactNode;

  switch (def.type) {
    case "checkbox":
      input = (
        <label className="flex items-center gap-2 h-9 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={value === true}
            onChange={(e) => onSave(e.target.checked)}
          />
          Ja
        </label>
      );
      break;
    case "select":
      input = (
        <select
          defaultValue={typeof value === "string" ? value : ""}
          onChange={(e) => onSave(e.target.value || null)}
          className={INPUT}
        >
          <option value="">—</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "number":
      input = (
        <input
          type="number"
          step="any"
          defaultValue={typeof value === "number" ? value : ""}
          onBlur={(e) => {
            if (e.target.validity.badInput) return;
            const raw = e.target.value.trim();
            const next = raw === "" ? null : Number(raw);
            const current = typeof value === "number" ? value : null;
            if (next !== current && !(next !== null && !Number.isFinite(next)))
              onSave(next);
          }}
          className={INPUT}
        />
      );
      break;
    case "date":
      input = (
        <input
          type="date"
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(e) => {
            if (e.target.validity.badInput) return;
            const next = e.target.value || null;
            const current = typeof value === "string" && value ? value : null;
            if (next !== current) onSave(next);
          }}
          className={INPUT}
        />
      );
      break;
    default: {
      const current = typeof value === "string" ? value : "";
      input = (
        <input
          type="text"
          defaultValue={current}
          maxLength={500}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== current.trim()) onSave(next || null);
          }}
          className={INPUT}
        />
      );
    }
  }

  return (
    <div>
      <label className="block text-[11px] text-sub mb-1">{def.label}</label>
      {input}
    </div>
  );
}

// ----- Deals (nur Anzeige) --------------------------------------------------

function DealsSection({
  deals,
}: {
  deals: ContactDrawerDetail["deals"];
}) {
  return (
    <Section title="Deals">
      {deals.length === 0 ? (
        <p className="text-sm text-sub">Noch keine Deals für diesen Kontakt.</p>
      ) : (
        <ul className="space-y-2">
          {deals.map((d) => (
            <li key={d.id}>
              <Link
                href={`/pipelines/${d.pipelineId}`}
                className="flex items-center justify-between gap-3 border border-line rounded-lg p-2.5 hover:bg-bg transition"
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
                        color: readableTextColor(d.stageColor ?? "#e2e8f0"),
                      }}
                    >
                      {d.stageName}
                    </span>
                    <span>· {d.pipelineName}</span>
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
    </Section>
  );
}

// ----- Löschen --------------------------------------------------------------

function DeleteButton({
  contactId,
  onDeleted,
}: {
  contactId: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startDelete] = useTransition();

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        title="Kontakt löschen"
        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-sub">Löschen?</span>
      <button
        disabled={pending}
        onClick={() =>
          startDelete(async () => {
            await bulkDeleteContactsAction([contactId]);
            onDeleted();
          })
        }
        className="h-8 px-2.5 inline-flex items-center rounded-md bg-err text-white text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
      >
        {pending ? "…" : "Ja"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="h-8 px-2.5 inline-flex items-center rounded-md border border-line text-xs text-sub hover:text-ink transition"
      >
        Nein
      </button>
    </div>
  );
}
