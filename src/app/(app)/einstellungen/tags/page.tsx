import { db } from "@/db";
import { tags, contacts } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { TagsManager } from "../_components/tags-manager";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const org = await requireActiveOrg();

  const [orgTags, contactTagRows] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.orgId, org.id))
      .orderBy(asc(tags.name)),
    db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(eq(contacts.orgId, org.id)),
  ]);

  // Nutzungszähler + Tags, die auf Kontakten stehen, aber (noch) nicht verwaltet sind.
  const usage: Record<string, number> = {};
  for (const row of contactTagRows) {
    for (const t of row.tags) usage[t] = (usage[t] ?? 0) + 1;
  }
  const managedNames = new Set(orgTags.map((t) => t.name));
  const unmanaged = Object.entries(usage)
    .filter(([name]) => !managedNames.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">Tags</h2>
      <p className="text-xs text-sub mb-4">
        Tags markieren Kontakte quer über alle Pipelines — Zuweisung auf der
        Kontakt-Detailseite, sichtbar als Spalte in der Kontakte-Tabelle.
      </p>
      <TagsManager
        tags={orgTags.map((t) => ({ ...t, count: usage[t.name] ?? 0 }))}
        unmanaged={unmanaged}
      />
    </div>
  );
}
