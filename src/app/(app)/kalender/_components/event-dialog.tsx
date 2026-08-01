"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  type CalendarEventType,
  type CalendarItem,
} from "@/lib/kalender";
import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
  type EventInput,
} from "../actions";

export type ContactOption = { id: string; name: string };

/** Was der Dialog beim Öffnen befüllt: neuer Termin (Datum) oder Edit (Item). */
export type DialogTarget =
  | { mode: "create"; date: Date }
  | { mode: "edit"; item: CalendarItem };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Lokales Datum + Zeit → ISO (UTC) für den Server. */
function buildIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString();
}

export function EventDialog({
  target,
  contactOptions,
  onClose,
}: {
  target: DialogTarget | null;
  contactOptions: ContactOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<CalendarEventType>("meeting");
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");

  // Form bei jedem Öffnen aus dem Target füllen.
  useEffect(() => {
    if (!target) return;
    setError(null);
    setContactSearch("");
    if (target.mode === "create") {
      const d = target.date;
      setTitle("");
      setType("meeting");
      setDate(dateInputValue(d));
      setAllDay(false);
      setStartTime("09:00");
      setEndTime("10:00");
      setLocation("");
      setDescription("");
      setContactId("");
    } else {
      const it = target.item;
      const start = new Date(it.start);
      const end = it.end ? new Date(it.end) : null;
      setTitle(it.title);
      setType(it.type);
      setDate(dateInputValue(start));
      setAllDay(it.allDay);
      setStartTime(timeInputValue(start));
      setEndTime(end ? timeInputValue(end) : "10:00");
      setLocation(it.location ?? "");
      setDescription(it.description ?? "");
      setContactId(it.contactId ?? "");
    }
  }, [target]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contactOptions.slice(0, 50);
    return contactOptions
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [contactOptions, contactSearch]);

  if (!target) return null;

  // CRM-Aktivitäten sind read-only — der Dialog editiert nur echte Termine.
  const readOnly = target.mode === "edit" && target.item.source === "activity";
  const editingId =
    target.mode === "edit" && target.item.source === "event"
      ? target.item.id
      : null;

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Bitte einen Titel angeben.");
      return;
    }
    if (!date) {
      setError("Bitte ein Datum wählen.");
      return;
    }
    const input: EventInput = {
      title: title.trim(),
      type,
      startAt: buildIso(date, allDay ? "00:00" : startTime),
      endAt: allDay ? null : endTime ? buildIso(date, endTime) : null,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      contactId: contactId || null,
    };
    startTransition(async () => {
      try {
        if (editingId) await updateEventAction(editingId, input);
        else await createEventAction(input);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  function remove() {
    if (!editingId) return;
    if (!confirm("Diesen Termin wirklich löschen?")) return;
    setError(null);
    startDelete(async () => {
      try {
        await deleteEventAction(editingId);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
      }
    });
  }

  const heading = readOnly
    ? "Aufgabe (CRM)"
    : editingId
      ? "Termin bearbeiten"
      : "Neuer Termin";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // Der Abstand oben/unten muss die Safe-Area einschließen: auf dem iPhone
      // läge der Dialog sonst unter Dynamic Island bzw. Home-Indikator. Ohne
      // Notch sind die Insets 0 → 1rem wie gehabt.
      style={{
        background: "rgba(15,23,42,0.55)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* max-h-full statt 90vh: iOS rechnet vh ohne Safe-Area, der Dialog wäre
          sonst höher als der sichtbare Bereich. Ab md bleibt es bei 90vh. */}
      <div className="bg-surface rounded-xl w-full max-w-lg shadow-xl max-h-full md:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface z-10">
          <h3 className="text-sm font-semibold text-ink">{heading}</h3>
          <button
            onClick={onClose}
            // -m-3 gleicht die Fläche wieder aus: das Kreuz bleibt optisch an
            // derselben Stelle, die Tippfläche wächst auf 40 × 40.
            className="-m-3 h-10 w-10 inline-flex items-center justify-center rounded-md text-sub hover:text-ink"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {readOnly ? (
          <ReadOnlyBody item={(target as { item: CalendarItem }).item} />
        ) : (
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Titel
              </label>
              <input
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z. B. Erstgespräch mit …"
                className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Art
                </label>
                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as CalendarEventType)
                  }
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink"
                >
                  {EVENT_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-sub mb-1">
                  Datum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-accent"
              />
              Ganztägig
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Beginn
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-sub mb-1">
                    Ende
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Ort (optional)
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z. B. Zoom, Büro, Telefon"
                className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Kontakt (optional)
              </label>
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Kontakt suchen …"
                className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg text-ink mb-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                size={4}
                className="w-full px-2 py-1 border border-line rounded-md text-sm bg-bg text-ink"
              >
                <option value="">— kein Kontakt —</option>
                {contactId &&
                  !filteredContacts.some((c) => c.id === contactId) && (
                    <option value={contactId}>
                      {contactOptions.find((c) => c.id === contactId)?.name ??
                        "Ausgewählter Kontakt"}
                    </option>
                  )}
                {filteredContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-sub mb-1">
                Notiz (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Details zum Termin …"
                className="w-full px-2 py-1.5 border border-line rounded-md text-sm bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>

            {error && <p className="text-xs text-err">{error}</p>}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-line">
              {editingId ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting || pending}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-err hover:bg-err/10 rounded-md transition disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Löscht …" : "Löschen"}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 text-sm text-sub hover:text-ink"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || deleting}
                  className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
                >
                  {pending
                    ? "Speichert …"
                    : editingId
                      ? "Speichern"
                      : "Termin anlegen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only-Ansicht für eingeblendete CRM-Aufgaben. */
function ReadOnlyBody({ item }: { item: CalendarItem }) {
  return (
    <div className="p-5 space-y-3 text-sm">
      <div className="text-base font-semibold text-ink">{item.title}</div>
      <p className="text-xs text-sub">
        Diese Aufgabe stammt aus dem CRM und wird dort bearbeitet.
      </p>
      {item.description && (
        <p className="text-sm text-ink whitespace-pre-wrap">
          {item.description}
        </p>
      )}
      {item.contactId && (
        <a
          href={`/crm/${item.contactId}`}
          className="inline-flex items-center text-sm text-info hover:underline"
        >
          Kontakt öffnen: {item.contactName ?? "Kontakt"}
        </a>
      )}
    </div>
  );
}
