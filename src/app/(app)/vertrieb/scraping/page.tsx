import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getScrapingStatsAction } from "./actions";
import { ScrapeForm } from "./_components/scrape-form";
import { EnrichPanel } from "./_components/enrich-panel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ScrapingPage() {
  const stats = await getScrapingStatsAction();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl">
      <div>
        <Link
          href="/vertrieb"
          className="inline-flex items-center gap-1.5 text-xs text-sub hover:text-ink transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur Lead-Inbox
        </Link>
        <h2 className="text-base font-semibold text-ink mt-2">Lead-Scraping</h2>
        <p className="text-xs text-sub mt-0.5">
          Unternehmen über Google Maps finden und automatisch Geschäftsführer +
          E-Mail recherchieren.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Gescrapte Leads" value={stats.scraped} />
        <StatCard label="Offen (Enrichment)" value={stats.pending} accent />
        <StatCard label="Angereichert" value={stats.enriched} />
      </div>

      <ScrapeForm />
      <EnrichPanel initialPending={stats.pending} />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div
        className={`text-2xl font-semibold ${accent ? "text-info" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="text-xs text-sub mt-0.5">{label}</div>
    </div>
  );
}
