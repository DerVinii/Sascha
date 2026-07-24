/**
 * Google-Kalender-Pull-Endpoint für den Vercel-Cron (Google → App).
 *
 * Auth: Bearer $CRON_SECRET (wie /api/enrichment/run). Vom Matcher der
 * Passwort-Middleware ausgenommen, damit der Cron ohne App-Cookie durchkommt.
 * Die App selbst löst den Pull über die Server-Action `syncGoogleAction` aus.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/server/active-org";
import { pullFromGoogle } from "@/lib/server/google/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // noch kein Secret -> offen (Übergang)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "no org" }, { status: 404 });
  const result = await pullFromGoogle(org.id);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
