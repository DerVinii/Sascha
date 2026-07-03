"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  User,
  X,
} from "lucide-react";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  TONE_CLASSES,
  addDays,
  addMonths,
  dayKey,
  fmtDayLong,
  fmtMonthYear,
  fmtTime,
  fmtWeekdayShort,
  itemLabel,
  itemTone,
  monthGridDays,
  monthParam,
  parseMonthParam,
  sameDay,
  startOfDay,
  weekDays,
  weekdayHeaders,
  type CalendarEventType,
  type CalendarItem,
} from "@/lib/kalender";
import { EventDialog, type ContactOption, type DialogTarget } from "./event-dialog";

type ViewMode = "month" | "week";
type TypeFilter = CalendarEventType | "all";

export function CalendarView({
  items,
  contactOptions,
  anchorMonth,
  todayIso,
}: {
  items: CalendarItem[];
  contactOptions: ContactOption[];
  anchorMonth: string;
  todayIso: string;
}) {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date(todayIso)), [todayIso]);
  const anchor = useMemo(() => {
    const { year, month } = parseMonthParam(anchorMonth, today);
    return new Date(year, month, 1);
  }, [anchorMonth, today]);
  const anchorIdx = anchor.getFullYear() * 12 + anchor.getMonth();

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(anchor);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dialogTarget, setDialogTarget] = useState<DialogTarget | null>(null);

  // Items nach lokalem Tag gruppieren (nach Filter), pro Tag chronologisch.
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (typeFilter !== "all" && it.type !== typeFilter) continue;
      const key = dayKey(new Date(it.start));
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = new Date(a.start).getTime();
        const tb = new Date(b.start).getTime();
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return ta - tb;
      });
    }
    return map;
  }, [items, typeFilter]);

  function eventsOf(d: Date): CalendarItem[] {
    return itemsByDay.get(dayKey(d)) ?? [];
  }

  function inWindow(d: Date): boolean {
    const idx = d.getFullYear() * 12 + d.getMonth();
    return idx >= anchorIdx - 2 && idx <= anchorIdx + 2;
  }

  /** Cursor setzen; außerhalb des geladenen Fensters neu laden. */
  function moveCursor(next: Date) {
    if (inWindow(next)) setCursor(next);
    else router.push(`/kalender?m=${monthParam(next)}`);
  }

  function goPrev() {
    moveCursor(view === "month" ? addMonths(cursor, -1) : addDays(cursor, -7));
  }
  function goNext() {
    moveCursor(view === "month" ? addMonths(cursor, 1) : addDays(cursor, 7));
  }
  function goToday() {
    moveCursor(
      view === "month"
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : today,
    );
  }

  function openCreate(date: Date) {
    setDialogTarget({ mode: "create", date });
  }
  function openItem(item: CalendarItem) {
    setDialogTarget({ mode: "edit", item });
  }

  // Zähler + Titel je nach Ansicht.
  const gridDays = view === "month" ? monthGridDays(cursor.getFullYear(), cursor.getMonth()) : weekDays(cursor);
  const countInView = useMemo(() => {
    if (view === "month") {
      let n = 0;
      for (const [key, arr] of itemsByDay) {
        const d = new Date(`${key}T00:00:00`);
        if (d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth())
          n += arr.length;
      }
      return n;
    }
    return weekDays(cursor).reduce((s, d) => s + eventsOf(d).length, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsByDay, cursor, view]);

  const title =
    view === "month"
      ? fmtMonthYear(cursor)
      : weekRangeLabel(weekDays(cursor));

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <button
          onClick={goToday}
          className="h-9 px-3 rounded-md border border-line text-sm font-medium text-sub hover:text-ink hover:bg-bg transition"
        >
          Heute
        </button>
        <div className="flex items-center">
          <button
            onClick={goPrev}
            aria-label="Zurück"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goNext}
            aria-label="Weiter"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-bg transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0">
          <div className="text-base font-semibold text-ink capitalize truncate">
            {title}
          </div>
          <div className="text-[11px] text-sub">
            {countInView}{" "}
            {countInView === 1 ? "Termin" : "Termine"}{" "}
            {view === "month" ? "diesen Monat" : "diese Woche"}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="h-9 px-2 rounded-md border border-line text-sm bg-surface text-ink"
            aria-label="Nach Art filtern"
          >
            <option value="all">Alle Arten</option>
            {EVENT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_META[t].label}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-md border border-line overflow-hidden">
            <button
              onClick={() => setView("week")}
              className={`h-9 px-3 text-sm font-medium transition ${
                view === "week"
                  ? "bg-brand text-white"
                  : "text-sub hover:text-ink hover:bg-bg"
              }`}
            >
              Woche
            </button>
            <button
              onClick={() => setView("month")}
              className={`h-9 px-3 text-sm font-medium transition border-l border-line ${
                view === "month"
                  ? "bg-brand text-white"
                  : "text-sub hover:text-ink hover:bg-bg"
              }`}
            >
              Monat
            </button>
          </div>

          <button
            onClick={() => openCreate(selectedDay ?? today)}
            className="h-9 px-3 md:px-4 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Neuer Termin</span>
          </button>
        </div>
      </div>

      {/* Kalenderfläche */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        {view === "month" ? (
          <MonthGrid
            days={gridDays}
            cursor={cursor}
            today={today}
            eventsOf={eventsOf}
            onSelectDay={setSelectedDay}
            onOpenItem={openItem}
          />
        ) : (
          <WeekGrid
            days={gridDays}
            today={today}
            eventsOf={eventsOf}
            onSelectDay={setSelectedDay}
            onOpenItem={openItem}
          />
        )}
      </div>

      {/* Tages-Übersicht */}
      {selectedDay && (
        <DayPanel
          day={selectedDay}
          today={today}
          items={eventsOf(selectedDay)}
          onClose={() => setSelectedDay(null)}
          onOpenItem={openItem}
          onCreate={() => openCreate(selectedDay)}
        />
      )}

      <EventDialog
        target={dialogTarget}
        contactOptions={contactOptions}
        onClose={() => setDialogTarget(null)}
      />
    </div>
  );
}

function weekRangeLabel(days: Date[]): string {
  const a = days[0];
  const b = days[6];
  const dfShort = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
  });
  const dfFull = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dfShort.format(a)} – ${dfFull.format(b)}`;
}

// ---------------------------------------------------------------------------
// Monatsraster
// ---------------------------------------------------------------------------

function MonthGrid({
  days,
  cursor,
  today,
  eventsOf,
  onSelectDay,
  onOpenItem,
}: {
  days: Date[];
  cursor: Date;
  today: Date;
  eventsOf: (d: Date) => CalendarItem[];
  onSelectDay: (d: Date) => void;
  onOpenItem: (i: CalendarItem) => void;
}) {
  return (
    <div>
      {/* Wochentagsleiste */}
      <div className="grid grid-cols-7 border-b border-line bg-bg/40">
        {weekdayHeaders().map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-[11px] font-medium text-sub tracking-wide text-center md:text-left"
          >
            {w}
          </div>
        ))}
      </div>
      {/* 6 Wochen */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const dayItems = eventsOf(d);
          return (
            <div
              key={dayKey(d)}
              onClick={() => onSelectDay(d)}
              className={`min-h-[84px] md:min-h-[104px] border-b border-r border-line p-1.5 cursor-pointer transition hover:bg-bg/60 ${
                inMonth ? "" : "bg-bg/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-brand text-white font-semibold"
                      : inMonth
                        ? "text-ink"
                        : "text-sub"
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayItems.length > 0 && (
                  <span className="md:hidden text-[10px] text-sub">
                    {dayItems.length}
                  </span>
                )}
              </div>

              {/* Desktop: Event-Chips */}
              <div className="hidden md:block mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map((it) => (
                  <EventChip key={it.id} item={it} onOpen={onOpenItem} />
                ))}
                {dayItems.length > 3 && (
                  <div className="px-1 text-[11px] text-sub">
                    +{dayItems.length - 3} mehr
                  </div>
                )}
              </div>

              {/* Mobile: farbige Punkte */}
              {dayItems.length > 0 && (
                <div className="md:hidden mt-1 flex flex-wrap gap-0.5">
                  {dayItems.slice(0, 4).map((it) => (
                    <span
                      key={it.id}
                      className={`h-1.5 w-1.5 rounded-full ${TONE_CLASSES[itemTone(it)].dot}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({
  item,
  onOpen,
}: {
  item: CalendarItem;
  onOpen: (i: CalendarItem) => void;
}) {
  const tone = TONE_CLASSES[itemTone(item)];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={item.title}
      className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left ${tone.chipBg} ${tone.chipText} hover:opacity-80 transition`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} />
      {!item.allDay && (
        <span className="text-[10px] tabular-nums shrink-0 opacity-80">
          {fmtTime(item.start)}
        </span>
      )}
      <span className="text-[11px] font-medium truncate">{item.title}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Wochenansicht (Agenda-Spalten)
// ---------------------------------------------------------------------------

function WeekGrid({
  days,
  today,
  eventsOf,
  onSelectDay,
  onOpenItem,
}: {
  days: Date[];
  today: Date;
  eventsOf: (d: Date) => CalendarItem[];
  onSelectDay: (d: Date) => void;
  onOpenItem: (i: CalendarItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[720px]">
        {days.map((d) => {
          const isToday = sameDay(d, today);
          const dayItems = eventsOf(d);
          return (
            <div key={dayKey(d)} className="border-r border-line last:border-r-0 min-h-[360px]">
              <button
                onClick={() => onSelectDay(d)}
                className="w-full px-2 py-2 border-b border-line text-left hover:bg-bg/60 transition"
              >
                <div className="text-[11px] text-sub uppercase">
                  {fmtWeekdayShort(d)}
                </div>
                <div
                  className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday ? "bg-brand text-white font-semibold" : "text-ink"
                  }`}
                >
                  {d.getDate()}
                </div>
              </button>
              <div className="p-1.5 space-y-1">
                {dayItems.length === 0 ? (
                  <div className="px-1 py-2 text-[11px] text-sub/70">—</div>
                ) : (
                  dayItems.map((it) => (
                    <WeekChip key={it.id} item={it} onOpen={onOpenItem} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekChip({
  item,
  onOpen,
}: {
  item: CalendarItem;
  onOpen: (i: CalendarItem) => void;
}) {
  const tone = TONE_CLASSES[itemTone(item)];
  return (
    <button
      onClick={() => onOpen(item)}
      className={`w-full text-left rounded-md border-l-2 pl-1.5 pr-1 py-1 ${tone.chipBg} hover:opacity-80 transition`}
      style={{ borderLeftColor: "currentColor" }}
    >
      <div className={`flex items-center gap-1 ${tone.chipText}`}>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} />
        <span className="text-[10px] tabular-nums">
          {item.allDay ? "Ganztägig" : fmtTime(item.start)}
        </span>
      </div>
      <div className="text-[11px] font-medium text-ink truncate">
        {item.title}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tages-Übersicht (Drawer)
// ---------------------------------------------------------------------------

function DayPanel({
  day,
  today,
  items,
  onClose,
  onOpenItem,
  onCreate,
}: {
  day: Date;
  today: Date;
  items: CalendarItem[];
  onClose: () => void;
  onOpenItem: (i: CalendarItem) => void;
  onCreate: () => void;
}) {
  const isToday = sameDay(day, today);
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full max-w-md bg-surface shadow-xl flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink capitalize">
              <CalendarDays className="h-4 w-4 text-sub" />
              {fmtDayLong(day)}
            </div>
            <div className="text-[11px] text-sub mt-0.5">
              {isToday && "Heute · "}
              {items.length} {items.length === 1 ? "Termin" : "Termine"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sub hover:text-ink"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-12 text-sm text-sub">
              Keine Termine an diesem Tag.
            </div>
          ) : (
            items.map((it) => (
              <DayRow key={it.id} item={it} onOpen={onOpenItem} />
            ))
          )}
        </div>

        <div className="p-4 border-t border-line">
          <button
            onClick={onCreate}
            className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition"
          >
            <Plus className="h-4 w-4" />
            Termin an diesem Tag
          </button>
        </div>
      </div>
    </div>
  );
}

function DayRow({
  item,
  onOpen,
}: {
  item: CalendarItem;
  onOpen: (i: CalendarItem) => void;
}) {
  const tone = TONE_CLASSES[itemTone(item)];
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full text-left rounded-lg border border-line bg-bg/40 hover:bg-bg transition p-3 flex gap-3"
    >
      <div className={`w-1 rounded-full shrink-0 ${tone.bar}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${tone.chipText}`}>
            {itemLabel(item)}
          </span>
        </div>
        <div className="text-sm font-medium text-ink mt-0.5 truncate">
          {item.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-sub">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {item.allDay
              ? "Ganztägig"
              : item.end
                ? `${fmtTime(item.start)} – ${fmtTime(item.end)}`
                : fmtTime(item.start)}
          </span>
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          )}
          {item.contactName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.contactName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
