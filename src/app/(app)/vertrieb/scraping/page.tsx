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
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <Link
          href="/vertrieb"
          className="inline-flex items-center gap-1.5 text-xs text-sub hover:text-ink transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zu den Listen
        </Link>
        <h2 className="text-base font-semibold text-ink mt-2">
          {data.listName}
        </h2>
        <p className="text-xs text-sub mt-0.5">
          Scrapen, importieren oder manuell hinzufügen — pro Zeile mit Gemini
          anreichern. Spreadsheet-Stil wie Clay.
        </p>
      </div>

      <LeadTable initial={data} />
    </div>
  );
}
