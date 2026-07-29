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
 * - /api/google/callback   (OAuth-Rücksprung von Google; eigener signierter State,
 *                           kann das Zugang-Cookie beim Cross-Site-Redirect nicht mitsenden)
 * - /api/scrape-selftest   (curl-Selbsttest; eigener Token via ?t=)
 * - /zeit/*               (Mitarbeiter-Zeiterfassung: Mitarbeiter kennen das
 *                           APP_PASSWORD nicht. Schutz ist stattdessen das
 *                           Geräte-Cookie, das jede /zeit-Seite und -Action
 *                           serverseitig prüft — siehe
 *                           src/lib/server/zeiterfassung/auth.ts.
 *                           Achtung: die Ausnahme muss `zeit$|zeit/` lauten,
 *                           ein bloßes `zeit` würde auch das Admin-Ressort
 *                           /zeiterfassung ungeschützt lassen.)
 * - Next-Assets & statische Dateien (Endung am Pfadende, siehe unten)
 *
 * Der Ausschluss für statische Dateien listet bewusst konkrete Endungen und ist
 * mit `$` ans Pfadende verankert. Ein einfaches `.*\..*` (jeder Pfad mit Punkt
 * irgendwo) hatte hier gestanden und öffnete jede dynamische Route, sobald ein
 * Punkt im Parameter steht: Ein POST auf /crm/a.b oder /zeiterfassung/mitarbeiter/a.b
 * lief mit gültigem `Next-Action`-Header komplett am Passwort-Gate vorbei, weil
 * Next die Action anhand des Headers ausführt und nicht anhand des Pfads.
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
    "/((?!_next/static|_next/image|favicon\\.ico|zugang|zeit$|zeit/|api/instantly/webhook|api/enrichment/run|api/google/sync|api/google/callback|api/scrape-selftest|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|txt|xml|json|webmanifest|woff2?|ttf|otf|mp4|webm|pdf)$).*)",
  ],
};
