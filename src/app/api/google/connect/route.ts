/**
 * Startet den Google-OAuth-Flow: setzt einen CSRF-`state` und leitet zur
 * Google-Consent-Seite weiter. Von Sascha per „Mit Google verbinden" ausgelöst.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/server/google/oauth";
import { googleConfigured } from "@/lib/server/google/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/einstellungen/kalender?fehler=nicht_konfiguriert", origin),
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(origin, state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return res;
}
