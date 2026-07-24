/**
 * Startet den Google-OAuth-Flow: erzeugt einen signierten CSRF-`state` und
 * leitet zur Google-Consent-Seite weiter. Von Sascha per „Mit Google verbinden"
 * ausgelöst.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl, createOAuthState } from "@/lib/server/google/oauth";
import { googleConfigured } from "@/lib/server/google/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/einstellungen/kalender?fehler=nicht_konfiguriert", origin),
    );
  }
  return NextResponse.redirect(buildAuthUrl(origin, createOAuthState()));
}
