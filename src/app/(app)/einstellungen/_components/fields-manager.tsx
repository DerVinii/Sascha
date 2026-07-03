"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import {
  CONTACT_FIELD_TYPES,
  fieldTypeLabel,
  type ContactFieldDef,
  type ContactFieldType,
} from "@/lib/contact-fields";
import {
  addContactFieldAction,
  updateContactFieldAction,
  moveContactFieldAction,
  deleteContactFieldAction,
} from "../actions";

const INPUT =
  "h-8 px-2 border border-line rounded-md text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export function FieldsManager({ fields }: { fields: ContactFieldDef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContactFieldDef | null>(
    null,
  );

  // Formular "Feld hinzufügen"
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ContactFieldType>("text");
  const [options, setOptions] = useState("");
  const [showInTable, setShowInTable] = useState(false);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      }
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    const optionList = options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (type === "select" && optionList.length === 0) {
      setError("Ein Auswahl-Feld braucht mindestens eine Option.");
      return;
    }
    run(async () => {
      await addContactFieldAction({
        label: trimmed,
        type,
        options: optionList,
        showInTable,
      });
      setLabel("");
      setOptions("");
      setType("text");
      setShowInTable(false);
    });
  }

  return (
    <div className="space-y-5">
      {/* Bestehende Felder */}
      {fields.length === 0 ? (
        <p className="text-sm text-sub py-2">
          Noch keine individuellen Felder angelegt.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((f, idx) => (
            <li
              key={`${f.key}:${f.label}:${(f.options ?? []).join("|")}:${f.showInTable}`}
              className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-bg/40 px-2 py-1.5"
            >
              <div className="flex md:flex-col">
                <button
                  onClick={() => run(() => moveContactFieldAction(f.key, "up"))}
                  disabled={pending || idx === 0}
                  className="h-8 w-8 md:h-4 md:w-4 inline-flex items-center justify-center rounded-md text-sub hover:text-ink disabled:opacity-20"
                  aria-label="Nach oben"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() =>
                    run(() => moveContactFieldAction(f.key, "down"))
                  }
                  disabled={pending || idx === fields.length - 1}
                  className="h-8 w-8 md:h-4 md:w-4 inline-flex items-center justify-center rounded-md text-sub hover:text-ink disabled:opacity-20"
                  aria-label="Nach unten"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>

              <input
                defaultValue={f.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== f.label)
                    run(() => updateContactFieldAction(f.key, { label: v }));
                }}
                disabled={pending}
                className={`flex-1 min-w-[140px] ${INPUT}`}
                aria-label="Feldname"
              />

              <span className="pill bg-bg text-sub border border-line shrink-0">
                {fieldTypeLabel(f.type)}
              </span>

              {f.type === "select" && (
                <input
                  defaultValue={(f.options ?? []).join(", ")}
                  onBlur={(e) => {
                    const next = e.target.value
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean);
                    if (next.length === 0) {
                      setError(
                        "Ein Auswahl-Feld braucht mindestens eine Option.",
                      );
                      return;
                    }
                    if (next.join("|") !== (f.options ?? []).join("|"))
                      run(() =>
                        updateContactFieldAction(f.key, { options: next }),
                      );
                  }}
                  disabled={pending}
                  placeholder="Optionen, komma-getrennt"
                  className={`w-44 ${INPUT}`}
                  aria-label="Optionen"
                />
              )}

              <label
                className="flex min-h-9 items-center gap-1.5 text-[11px] text-sub shrink-0 cursor-pointer"
                title="Als Spalte in der Kontakte-Tabelle anzeigen"
              >
                <input
                  type="checkbox"
                  checked={f.showInTable}
                  onChange={(e) =>
                    run(() =>
                      updateContactFieldAction(f.key, {
                        showInTable: e.target.checked,
                      }),
                    )
                  }
                  disabled={pending}
                />
                Spalte
              </label>

              <button
                onClick={() => setConfirmDelete(f)}
                disabled={pending}
                className="h-9 w-9 md:h-7 md:w-7 inline-flex items-center justify-center rounded-md text-err hover:bg-err/10 transition disabled:opacity-40"
                aria-label={`Feld ${f.label} löschen`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Feld hinzufügen */}
      <form onSubmit={handleAdd} className="pt-4 border-t border-line space-y-3">
        <div className="text-[11px] font-medium text-sub uppercase tracking-wide">
          Neues Feld
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Feldname, z. B. Budget"
            maxLength={60}
            className={`flex-1 min-w-[160px] h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent`}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ContactFieldType)}
            className="h-9 px-2 border border-line rounded-md text-sm bg-bg"
            aria-label="Feldtyp"
          >
            {CONTACT_FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex min-h-9 items-center gap-1.5 text-[11px] text-sub shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={showInTable}
              onChange={(e) => setShowInTable(e.target.checked)}
            />
            Spalte
          </label>
          <button
            type="submit"
            disabled={pending || !label.trim()}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Wird angelegt …" : "Anlegen"}
          </button>
        </div>
        {type === "select" && (
          <input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="Optionen, komma-getrennt — z. B. Klein, Mittel, Groß"
            className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        )}
        {error && <p className="text-xs text-err">{error}</p>}
      </form>

      {/* Lösch-Bestätigung */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.55)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending)
              setConfirmDelete(null);
          }}
        >
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-xl p-5">
            <h3 className="text-sm font-semibold text-ink">Feld löschen?</h3>
            <p className="text-sm text-sub mt-2">
              Das Feld{" "}
              <span className="font-medium text-ink">
                {confirmDelete.label}
              </span>{" "}
              wird aus den Einstellungen, der Kontakt-Detailseite und der
              Tabelle entfernt. Bereits gespeicherte Werte bleiben in der
              Datenbank erhalten.
            </p>
            {error && <p className="text-xs text-err mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
                className="h-9 px-4 text-sm text-sub hover:text-ink disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  const key = confirmDelete.key;
                  run(async () => {
                    await deleteContactFieldAction(key);
                    setConfirmDelete(null);
                  });
                }}
                disabled={pending}
                className="h-9 px-4 bg-err text-white text-sm font-medium rounded-md hover:opacity-90 transition disabled:opacity-50"
              >
                {pending ? "Wird gelöscht …" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
