import { Installieren } from "./_components/installieren";

export const dynamic = "force-dynamic";

/**
 * Einstiegsseite für Mitarbeiter — das Ziel des QR-Codes, den Sascha zeigt.
 *
 * Sie erklärt die Installation als eigene App und leitet weiter, sobald sie
 * merkt, dass sie bereits in der installierten App läuft. Die Stempeluhr selbst
 * ist die `start_url` (siehe public/zeit.webmanifest), diese Seite bekommt man
 * nach der Installation also normalerweise nie wieder zu sehen.
 */
export default function ZeitIndexPage() {
  return <Installieren />;
}
