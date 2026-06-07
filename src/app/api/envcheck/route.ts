import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMPORÄRE Diagnose-Route: zeigt nur Env-NAMEN/Presence (keine Werte).
// Wird nach der Diagnose wieder entfernt.
export async function GET() {
  const names = Object.keys(process.env);
  const matchingNames = names
    .filter((n) => /PLACES|GEMINI|DATABASE|SUPABASE|VERCEL|INSTANTLY/i.test(n))
    .sort();
  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    has: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      GEMINI_MODEL: !!process.env.GEMINI_MODEL,
    },
    matchingNames,
    totalEnvCount: names.length,
  });
}
