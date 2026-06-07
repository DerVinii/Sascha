"use client";

import { useState, useTransition } from "react";
import {
  X,
  Type,
  Mail,
  Link as LinkIcon,
  Hash,
  CheckSquare,
  List,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import type {
  LeadColumnConfig,
  LeadColumnKind,
  LeadDataType,
} from "@/lib/scraping-types";

export type NewColumnInput = {
  label: string;
  kind: LeadColumnKind;
  dataType: LeadDataType;
  config?: LeadColumnConfig;
  color?: string | null;
};

type Option = {
  id: string;
  group: "Datentyp" | "Enrichment / AI";
  icon: React.ReactNode;
  label: string;
  description: string;
  defaultName: string;
  build: (name: string) => NewColumnInput;
};

const GEMINI_CONFIG: LeadColumnConfig = {
  provider: ["gemini"],
  inputs: {
    Firmenname: "company.name",
    Webseite: "company.customFields.websiteUri",
    "Google Maps Link": "company.customFields.googleMapsUri",
  },
  outputs: [
    { field: "vorname", label: "Vorname", type: "text" },
    { field: "nachname", label: "Nachname", type: "text" },
    { field: "email", label: "E-Mail", type: "email" },
  ],
  runSettings: { autoUpdate: false, onlyRunIf: "always" },
};

const OPTIONS: Option[] = [
  {
    id: "text",
    group: "Datentyp",
    icon: <Type className="h-4 w-4" />,
    label: "Text",
    description: "Freitext-Feld",
    defaultName: "Text",
    build: (label) => ({ label, kind: "data", dataType: "text" }),
  },
  {
    id: "email",
    group: "Datentyp",
    icon: <Mail className="h-4 w-4" />,
    label: "E-Mail",
    description: "E-Mail-Adresse",
    defaultName: "E-Mail",
    build: (label) => ({ label, kind: "data", dataType: "email" }),
  },
  {
    id: "url",
    group: "Datentyp",
    icon: <LinkIcon className="h-4 w-4" />,
    label: "URL",
    description: "Klickbarer Link",
    defaultName: "Link",
    build: (label) => ({ label, kind: "data", dataType: "url" }),
  },
  {
    id: "number",
    group: "Datentyp",
    icon: <Hash className="h-4 w-4" />,
    label: "Zahl",
    description: "Numerischer Wert",
    defaultName: "Zahl",
    build: (label) => ({ label, kind: "data", dataType: "number" }),
  },
  {
    id: "checkbox",
    group: "Datentyp",
    icon: <CheckSquare className="h-4 w-4" />,
    label: "Checkbox",
    description: "Ja/Nein — ideal für Bedingungen",
    defaultName: "Markiert",
    build: (label) => ({ label, kind: "data", dataType: "checkbox" }),
  },
  {
    id: "select",
    group: "Datentyp",
    icon: <List className="h-4 w-4" />,
    label: "Auswahl",
    description: "Tag/Status-Feld",
    defaultName: "Status",
    build: (label) => ({ label, kind: "data", dataType: "select" }),
  },
  {
    id: "gemini",
    group: "Enrichment / AI",
    icon: <Sparkles className="h-4 w-4 text-info" />,
    label: "Geschäftsführer + E-Mail finden",
    description: "Gemini recherchiert pro Zeile Name + E-Mail (Google-Suche)",
    defaultName: "Geschäftsführer finden",
    build: (label) => ({
      label,
      kind: "enrichment",
      dataType: "text",
      config: GEMINI_CONFIG,
      color: "info",
    }),
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewColumnInput) => Promise<void>;
};

export function AddColumnPanel({ open, onClose, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Option | null>(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function pick(opt: Option) {
    setSelected(opt);
    setName(opt.defaultName);
  }
  function create() {
    if (!selected) return;
    startTransition(async () => {
      await onCreate(selected.build(name.trim() || selected.defaultName));
      reset();
      onClose();
    });
  }
  function reset() {
    setSelected(null);
    setName("");
    setQuery("");
  }

  const filtered = OPTIONS.filter(
    (o) =>
      !query ||
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      o.description.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = ["Datentyp", "Enrichment / AI"] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-ink">
            {selected ? "Spalte benennen" : "Spalte hinzufügen"}
          </h3>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-sub hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected ? (
          <>
            <div className="px-4 py-2 border-b border-line">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen … (Text, E-Mail, Enrichment …)"
                className="w-full h-9 px-2 bg-transparent text-sm text-ink placeholder:text-sub focus:outline-none"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {groups.map((g) => {
                const items = filtered.filter((o) => o.group === g);
                if (items.length === 0) return null;
                return (
                  <div key={g} className="mb-2">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-sub">
                      {g}
                    </div>
                    {items.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => pick(o)}
                        className="flex w-full items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-bg transition"
                      >
                        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md bg-bg text-sub">
                          {o.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">
                            {o.label}
                          </span>
                          <span className="block text-xs text-sub truncate">
                            {o.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-4 space-y-4">
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              zurück
            </button>
            <div className="flex items-center gap-2 text-sm text-ink">
              {selected.icon}
              {selected.label}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-sub">Spaltenname</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                className="mt-1 w-full h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-info/30"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelected(null)}
                className="h-9 px-4 text-sm text-sub hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                onClick={create}
                disabled={pending}
                className="h-9 px-4 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
              >
                {pending ? "Wird erstellt …" : "Spalte erstellen"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
