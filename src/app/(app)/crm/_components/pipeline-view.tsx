"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { STATUS_LABELS } from "@/components/crm/status-pill";
import type { ContactStatus } from "../actions";
import { updateContactStatusAction } from "../actions";

type PipelineContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  status: ContactStatus;
  tags: string[];
};

const STAGES: { key: ContactStatus; color: string }[] = [
  { key: "lead", color: "#fef3c7" },
  { key: "qualified", color: "#dbeafe" },
  { key: "in_conversation", color: "#e0e7ff" },
  { key: "meeting_booked", color: "#fed7aa" },
  { key: "won", color: "#d1fae5" },
  { key: "lost", color: "#fee2e2" },
];

export function PipelineView({
  contacts: initial,
}: {
  contacts: PipelineContact[];
}) {
  const [items, setItems] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const contactId = String(e.active.id);
    const newStatus = String(e.over.id) as ContactStatus;
    const contact = items.find((c) => c.id === contactId);
    if (!contact || contact.status === newStatus) return;

    // Optimistic update
    setItems((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, status: newStatus } : c)),
    );

    startTransition(async () => {
      await updateContactStatusAction(contactId, newStatus);
    });
  }

  const grouped: Record<ContactStatus, PipelineContact[]> = {
    lead: [],
    qualified: [],
    in_conversation: [],
    meeting_booked: [],
    won: [],
    lost: [],
  };
  for (const c of items) grouped[c.status].push(c);

  const activeContact = activeId
    ? items.find((c) => c.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
        {STAGES.map((stage) => (
          <Column
            key={stage.key}
            status={stage.key}
            color={stage.color}
            contacts={grouped[stage.key]}
          />
        ))}
      </div>

      <DragOverlay>
        {activeContact ? (
          <Card contact={activeContact} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  color,
  contacts,
}: {
  status: ContactStatus;
  color: string;
  contacts: PipelineContact[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div
        className="px-3 py-2 rounded-t-lg border-b-2 border-line text-xs font-semibold uppercase tracking-wide text-ink flex items-center justify-between"
        style={{ background: color }}
      >
        <span>{STATUS_LABELS[status]}</span>
        <span className="text-[10px] bg-white/60 rounded-full px-1.5">
          {contacts.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[60vh] p-2 space-y-2 bg-bg/60 rounded-b-lg border border-t-0 border-line ${
          isOver ? "bg-sidebar/5" : ""
        }`}
      >
        {contacts.map((c) => (
          <Card key={c.id} contact={c} />
        ))}
        {contacts.length === 0 && (
          <p className="text-[11px] text-sub text-center py-4">
            (leer)
          </p>
        )}
      </div>
    </div>
  );
}

function Card({
  contact,
  dragging = false,
}: {
  contact: PipelineContact;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: contact.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "(ohne Namen)";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-surface border border-line rounded-lg p-3 cursor-grab active:cursor-grabbing ${
        isDragging && !dragging ? "opacity-30" : ""
      } ${dragging ? "shadow-lg rotate-2" : "hover:border-sub"}`}
    >
      <Link
        href={`/crm/${contact.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm font-medium text-ink hover:underline block truncate"
      >
        {fullName}
      </Link>
      {contact.companyName && (
        <p className="text-xs text-sub mt-0.5 truncate">
          {contact.companyName}
        </p>
      )}
      {contact.email && (
        <p className="text-[11px] text-sub mt-1 truncate">{contact.email}</p>
      )}
      {contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {contact.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-px rounded-full bg-bg text-sub"
            >
              {t}
            </span>
          ))}
          {contact.tags.length > 2 && (
            <span className="text-[10px] text-sub">
              +{contact.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
