import Link from "next/link";
import { Download, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

const EXPORTS = [
  {
    href: "/api/crm/export",
    title: "Kontakte exportieren",
    desc: "Alle Kontakte mit Firma, Status, Tags und Zeitstempeln.",
  },
  {
    href: "/api/crm/export-companies",
    title: "Firmen exportieren",
    desc: "Alle Firmen mit Webseite, Adresse und Kontakt-Anzahl.",
  },
  {
    href: "/api/crm/export-deals",
    title: "Deals exportieren",
    desc: "Alle Deals mit Pipeline, Phase, Wert und Kontakt.",
  },
];

export default function DatenPage() {
  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Exporte</h2>
        <p className="text-xs text-sub mb-4">
          CSV-Dateien in UTF-8 mit BOM — öffnen direkt in Excel.
        </p>
        <ul className="space-y-2">
          {EXPORTS.map((e) => (
            <li key={e.href}>
              <a
                href={e.href}
                className="flex items-center justify-between gap-3 border border-line rounded-lg p-3 hover:bg-bg transition group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{e.title}</div>
                  <div className="text-[11px] text-sub mt-0.5">{e.desc}</div>
                </div>
                <Download className="h-4 w-4 text-sub group-hover:text-ink shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">Import</h2>
        <p className="text-xs text-sub mb-4">
          Leads und Kontakte kommen per CSV-Import über den Vertrieb herein —
          mit Dubletten-Erkennung per E-Mail-Adresse.
        </p>
        <Link
          href="/vertrieb"
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition"
        >
          <Upload className="h-4 w-4" />
          Zum CSV-Import im Vertrieb
        </Link>
      </div>
    </>
  );
}
