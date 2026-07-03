"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ContactFieldDef,
  type ContactFieldValue,
} from "@/lib/contact-fields";
import { updateContactFieldValueAction } from "../../actions";

const INPUT =
  "w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export function CustomFieldsEditor({
  contactId,
  defs,
  values,
}: {
  contactId: string;
  defs: ContactFieldDef[];
  values: Record<string, ContactFieldValue>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(key: string, value: ContactFieldValue) {
    setError(null);
    startTransition(async () => {
      try {
        await updateContactFieldValueAction(contactId, key, value);
        router.refresh();
      } catch {
        setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {defs.map((def) => (
          <FieldInput
            key={`${def.key}:${String(values[def.key] ?? "")}`}
            def={def}
            value={values[def.key] ?? null}
            onSave={(v) => save(def.key, v)}
          />
        ))}
      </div>
      {pending && <p className="text-[11px] text-sub mt-2">Speichert …</p>}
      {error && <p className="text-xs text-err mt-2">{error}</p>}
    </div>
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
            // badInput: Inhalt ist keine gültige Zahl (z. B. "1,5" in
            // Firefox) — value wäre "" und würde den Wert still löschen.
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
      // text | url | phone
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
