import { IntegrationCard } from "../_components/integration-card";

export const dynamic = "force-dynamic";

export default function IntegrationenPage() {
  const services = [
    {
      service: "instantly" as const,
      name: "Instantly",
      description:
        "Cold-Outreach: Kampagnen, Sending-Accounts und die Unibox im Postfach.",
      envVar: "INSTANTLY_API_KEY",
      configured: !!process.env.INSTANTLY_API_KEY?.trim(),
    },
    {
      service: "places" as const,
      name: "Google Places",
      description: "Lead-Scraping im Vertrieb (Firmen-Recherche nach Nische & Ort).",
      envVar: "GOOGLE_PLACES_API_KEY",
      configured: !!process.env.GOOGLE_PLACES_API_KEY?.trim(),
    },
    {
      service: "gemini" as const,
      name: "Google Gemini",
      description:
        "KI-Anreicherung: Ansprechpartner-Suche und KI-Spalten in der Lead-Tabelle.",
      envVar: "GEMINI_API_KEY",
      configured: !!process.env.GEMINI_API_KEY?.trim(),
    },
  ];

  return (
    <>
      {services.map((s) => (
        <IntegrationCard key={s.service} {...s} />
      ))}
      <p className="text-[11px] text-sub px-1">
        API-Keys werden aus Sicherheitsgründen nicht in der App verwaltet,
        sondern als Umgebungsvariablen in Vercel (Projekt → Settings →
        Environment Variables). Nach einer Änderung dort ist ein Redeploy
        nötig.
      </p>
    </>
  );
}
