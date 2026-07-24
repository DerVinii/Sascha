import { NextRequest, NextResponse } from "next/server";
import { ZUGANG_COOKIE, zugangToken } from "@/lib/zugang-token";

/**
 * Passwort-Gate für die gesamte App.
 *
 * Aktiv NUR, wenn die Umgebungsvariable APP_PASSWORD gesetzt ist — ohne sie
 * bleibt die App offen (Status im UI: /einstellungen/sicherheit).
 *
 * Vom Matcher ausgenommen:
 * - /zugang               (die Passwortseite selbst, inkl. Login-Action)
 * - /api/instantly/webhook (Instantly sendet keine Cookies; eigener Header-Secret)
 * - /api/enrichment/run    (Cron/Self-Chain; eigener CRON_SECRET-Bearer)
 * - /api/google/sync       (Kalender-Cron; eigener CRON_SECRET-Bearer)
 * - /api/scrape-selftest   (curl-Selbsttest; eigener Token via ?t=)
 * - Next-Assets & Dateien mit Endung
 */
export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(ZUGANG_COOKIE)?.value;
  if (cookie && cookie === (await zugangToken(password))) {
    return NextResponse.next();
  }

  // API-Aufrufe bekommen 401 statt Redirect (sonst lädt z. B. der
  // CSV-Export eine HTML-Loginseite als Datei herunter).
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/zugang";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|zugang|api/instantly/webhook|api/enrichment/run|api/google/sync|api/scrape-selftest|.*\\..*).*)",
  ],
};
