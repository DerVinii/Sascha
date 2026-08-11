import type { LeadTag, LeadTagColor } from "@/lib/scraping-types";

/**
 * Klassen je Farbe voll ausgeschrieben — Tailwind liest die Klassennamen zur
 * Bauzeit aus dem Quelltext; ein zusammengebautes `bg-${farbe}-500` landet nie
 * im fertigen CSS.
 */
const BADGE: Record<LeadTagColor, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  violet:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

const DOT: Record<LeadTagColor, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
  slate: "bg-slate-500",
};

/** Farbpunkt vor dem Tag-Namen in den Auswahllisten. */
export function TagDot({ color }: { color: LeadTagColor }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${DOT[color]}`}
      aria-hidden="true"
    />
  );
}

/** Die Markierung auf der Kampagnen-Kachel. */
export function TagBadge({
  tag,
  className = "",
}: {
  tag: Pick<LeadTag, "name" | "color">;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE[tag.color]} ${className}`}
    >
      <TagDot color={tag.color} />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}
