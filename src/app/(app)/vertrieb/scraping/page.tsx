import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listLeadTableAction } from "./actions";
import { LeadTable } from "./_components/lead-table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ScrapingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const sp = await searchParams;
  const listId = sp.list;
  if (!listId) redirect("/vertrieb");

  const data = await listLeadTableAction({ listId }).catch(() => null);
  if (!data) redirect("/vertrieb");

  return (
    // h-full + min-h-0: die Seite füllt genau den sichtbaren Bereich, damit die
    // Lead-Tabelle darunter selbst scrollt und ihr waagerechter Schieberegler
    // immer am unteren Bildschirmrand steht (statt am Ende einer langen Liste).
    <div className="p-4 md:p-6 flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <Link
          href="/vertrieb"
          className="inline-flex items-center gap-1.5 text-xs text-sub hover:text-ink transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zu den Kampagnen
        </Link>
        <h2 className="text-base font-semibold text-ink mt-2">
          {data.listName}
        </h2>
      </div>

      <LeadTable initial={data} />
    </div>
  );
}
