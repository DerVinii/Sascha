"use client";

import { useState, useTransition } from "react";
import { addNoteAction } from "../actions";

export function NewNoteForm({ contactId }: { contactId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      await addNoteAction(contactId, body);
      setBody("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Notiz hinzufügen …"
        className="w-full text-sm px-3 py-2 border border-line rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar resize-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="h-7 px-3 text-xs bg-brand text-white rounded-md hover:bg-sidebar-soft transition disabled:opacity-50"
        >
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
