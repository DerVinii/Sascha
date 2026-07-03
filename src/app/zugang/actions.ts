"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZUGANG_COOKIE, zugangToken } from "@/lib/zugang-token";

export async function loginAction(formData: FormData) {
  const password = process.env.APP_PASSWORD?.trim();
  const input = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "/");
  // Nur interne Pfade als Redirect-Ziel zulassen: genau ein führender "/",
  // danach weder "/" noch "\" (Browser normalisieren "/\evil.com" zu
  // "https://evil.com/" — Open-Redirect).
  const next =
    rawNext === "/" || /^\/(?![/\\])/.test(rawNext) ? rawNext : "/";

  // Schutz nicht aktiv → direkt durchlassen.
  if (!password) redirect(next);

  if (input !== password) {
    redirect(`/zugang?fehler=1&next=${encodeURIComponent(next)}`);
  }

  const store = await cookies();
  store.set(ZUGANG_COOKIE, await zugangToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
    path: "/",
  });
  redirect(next);
}
