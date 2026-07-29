import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PWA-Manifest für genau eine Einladung.
 *
 * Der Unterschied zum allgemeinen `public/zeit.webmanifest` ist die
 * `start_url`: Sie zeigt auf die Einladungsseite statt auf die Stempeluhr.
 * Dadurch öffnet die frisch installierte App beim ersten Start noch einmal die
 * Einladung — und zwar in ihrem eigenen Datenspeicher. Genau dort wird das
 * Geräte-Cookie gesetzt. Ohne diesen Umweg bliebe eine auf dem iPhone
 * installierte App dauerhaft „nicht eingerichtet“, weil sie die Cookies aus
 * Safari nicht sieht.
 *
 * Ist die Einladung eingelöst, leitet die Seite sofort auf /zeit/stempel weiter
 * — der Umweg kostet also nur beim allerersten Start etwas.
 *
 * Kein eigener Zugriffsschutz nötig: Der Pfad liegt unter /zeit und ist damit
 * ohnehin vom APP_PASSWORD-Gate ausgenommen. Das Token im Pfad wird hier nicht
 * geprüft — ein Manifest verrät nichts, was der Aufrufer nicht schon hat.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const start = `/zeit/einladung/${encodeURIComponent(token)}`;

  return NextResponse.json(
    {
      name: "SK Zeit",
      short_name: "SK Zeit",
      description: "Ein- und Ausstempeln für das Team von SK – Dozent und Coach",
      start_url: start,
      scope: "/zeit",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0f766e",
      theme_color: "#0f766e",
      lang: "de",
      icons: [
        {
          src: "/zeit-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/zeit-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/zeit-icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-store",
      },
    },
  );
}
