"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { updateContactTagsAction } from "../../actions";
import { readableTextColor } from "@/lib/pipeline-templates";

export function TagsEditor({
  contactId,
  tags,
  orgTags,
}: {
  contactId: string;
  tags: string[];
  orgTags: { name: string; color: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const colorFor = (name: string) =>
    orgTags.find((t) => t.name === name)?.color ?? "#e2e8f0";
  const available = orgTags.filter((t) => !tags.includes(t.name));

  function save(next: string[]) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      try {
        await updateContactTagsAction(contactId, next);
        router.refresh();
      } catch {
        setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="pill"
          style={{ background: colorFor(t), color: readableTextColor(colorFor(t)) }}
        >
          {t}
          <button
            onClick={() => save(tags.filter((x) => x !== t))}
            disabled={pending}
            className="p-1.5 -m-1 inline-flex items-center justify-center hover:opacity-60 disabled:opacity-40"
            aria-label={`Tag ${t} entfernen`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className="pill min-h-[32px] px-2 bg-bg text-sub border border-line hover:text-ink hover:border-sub transition disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Tag
        </button>
        {open && (
          <div className="absolute z-10 top-full mt-1 left-0 bg-surface border border-line rounded-md p-1.5 shadow-lg w-48">
            {available.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-sub">
                {orgTags.length === 0
                  ? "Noch keine Tags angelegt."
                  : "Alle Tags sind bereits zugewiesen."}
              </p>
            ) : (
              available.map((t) => (
                <button
                  key={t.name}
                  onClick={() => save([...tags, t.name])}
                  disabled={pending}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-ink rounded hover:bg-bg text-left disabled:opacity-50"
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

      {error && <span className="text-xs text-err">{error}</span>}
    </div>
  );
}
