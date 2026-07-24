/**
 * OAuth-Callback von Google. Tauscht den Code gegen Tokens, speichert die
 * Verbindung für die aktive Org und zieht direkt einen ersten Abgleich.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/server/active-org";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  saveConnection,
  verifyOAuthState,
} from "@/lib/server/google/oauth";
import { pullFromGoogle } from "@/lib/server/google/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (q: string) =>
    NextResponse.redirect(new URL(`/einstellungen/kalender${q}`, origin));

  const sp = req.nextUrl.searchParams;
  const error = sp.get("error");
  if (error) return back(`?fehler=${encodeURIComponent(error)}`);

  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !verifyOAuthState(state)) {
    return back("?fehler=state");
  }

  try {
    const tokens = await exchangeCodeForTokens(origin, code);
    const email = await fetchUserEmail(tokens.access_token);
    const org = await requireActiveOrg();
    await saveConnection(org.id, tokens, email);
    await pullFromGoogle(org.id); // erster Abgleich sofort
    return back("?verbunden=1");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unbekannter Fehler";
    return back(`?fehler=${encodeURIComponent(msg)}`);
  }
}
