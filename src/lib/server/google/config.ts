/**
 * Zentrale Konfiguration für die Google-Kalender-Anbindung.
 * Bewusst frei von DB-/Next-Importen, damit es überall server-seitig läuft.
 */

/** OAuth-Scopes: Kalender-Events lesen+schreiben, plus E-Mail zur Anzeige. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";
export const GOOGLE_CAL_BASE = "https://www.googleapis.com/calendar/v3";

/** Zeitzone, in der wir Termine nach Google schreiben. */
export const CALENDAR_TIMEZONE = "Europe/Berlin";

export function googleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
}

export function googleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
}

/** True, sobald Client-ID & Secret gesetzt sind (App kann verbinden). */
export function googleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/**
 * Die Redirect-URI muss exakt einer in der Google Cloud Console
 * hinterlegten URI entsprechen. Standard: `${origin}/api/google/callback`,
 * überschreibbar via GOOGLE_REDIRECT_URI (z. B. feste Prod-Domain).
 */
export function googleRedirectUri(origin: string): string {
  const override = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (override) return override;
  return `${origin.replace(/\/$/, "")}/api/google/callback`;
}
