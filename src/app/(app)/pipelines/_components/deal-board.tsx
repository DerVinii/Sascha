"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useContactDrawer } from "@/components/crm/contact-drawer";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { formatEur, readableTextColor } from "@/lib/pipeline-templates";
import { moveDealToStage } from "@/app/(app)/crm/pipeline-actions";

export type BoardStage = {
  id: string;
  name: string;
  position: number;
  color: string | null;
};

export type BoardDeal = {
  id: string;
  title: string;
  valueEur: number | null;
  stageId: string;
  contactId: string | null;
  contactName: string | null;
  companyName: string | null;
};

export function DealBoard({
  stages,
  deals,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(deals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setItems(deals);
  }, [deals]);

  // Getrennte Sensoren statt PointerSensor: Auf Touch startet der Drag erst
  // nach kurzem Halten (delay), sonst bricht die native Scroll-Geste ihn ab —
  // und Scrollen durch die Spalten bleibt möglich.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const dealId = String(e.active.id);
    const newStageId = String(e.over.id);
    const deal = items.find((d) => d.id === dealId);
    if (!deal || deal.stageId === newStageId) return;
    const prevStageId = deal.stageId;

    setItems((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: newStageId } : d)),
    );
    startTransition(async () => {
      try {
        await moveDealToStage(dealId, newStageId);
      } catch {
        setItems((prev) =>
          prev.map((d) =>
            d.id === dealId ? { ...d, stageId: prevStageId } : d,
          ),
        );
        router.refresh();
      }
    });
  }

  const activeDeal = activeId ? items.find((d) => d.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {ordered.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            deals={items.filter((d) => d.stageId === stage.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? <Card deal={activeDeal} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, deals }: { stage: BoardStage; deals: BoardDeal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = deals.reduce((s, d) => s + (d.valueEur ?? 0), 0);
  const bg = stage.color ?? "#e2e8f0";
  // Schriftfarbe je nach Hintergrund-Helligkeit — kräftige Phasen bekommen
  // weiße Schrift, helle Pastelltöne dunkle.
  const fg = readableTextColor(bg);
  const dark = fg === "#ffffff";

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div
        className="px-3 py-2 rounded-t-lg border-b-2 border-line flex items-center justify-between"
        style={{ background: bg, color: fg }}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide truncate">
            {stage.name}
          </div>
          <div className="text-[10px] opacity-70">{formatEur(sum)}</div>
        </div>
        <span
          className="text-[10px] rounded-full px-1.5 py-0.5 shrink-0"
          style={{
            background: dark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.6)",
            color: fg,
          }}
        >
          {deals.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[55dvh] p-2 space-y-2 bg-bg/60 rounded-b-lg border border-t-0 border-line ${
          isOver ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : ""
        }`}
      >
        {deals.map((d) => (
          <Card key={d.id} deal={d} />
        ))}
        {deals.length === 0 && (
          <p className="text-[11px] text-sub text-center py-4">(leer)</p>
        )}
      </div>
    </div>
  );
}

function Card({
  deal,
  dragging = false,
}: {
  deal: BoardDeal;
  dragging?: boolean;
}) {
  const { open: openContact } = useContactDrawer();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-surface border border-line rounded-lg p-3 cursor-grab active:cursor-grabbing touch-manipulation ${
        isDragging && !dragging ? "opacity-30" : ""
      } ${dragging ? "shadow-lg rotate-2" : "hover:border-sub"}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* min-w-0: ohne das schrumpft der Titel als Flex-Kind nicht und
            schiebt den Betrag aus der Karte. */}
        <span className="text-sm font-medium text-ink truncate min-w-0">
          {deal.title}
        </span>
        {deal.valueEur != null && (
          <span className="text-[11px] font-semibold text-ink whitespace-nowrap">
            {formatEur(deal.valueEur)}
          </span>
        )}
      </div>
      {deal.contactId ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openContact(deal.contactId as string);
          }}
          // dnd-kit lauscht auf mousedown/touchstart (Maus-/Touch-Sensor) —
          // genau diese hier stoppen, damit ein Klick auf den Namen keinen Drag
          // startet, sondern das Kontakt-Panel öffnet.
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="text-xs text-sub mt-1 block truncate text-left hover:text-ink hover:underline"
        >
          {deal.contactName || deal.companyName || "(ohne Namen)"}
        </button>
      ) : (
        <span className="text-xs text-sub mt-1 block">(kein Kontakt)</span>
      )}
    </div>
  );
}
