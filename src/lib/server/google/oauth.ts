/**
 * OAuth-2.0-Handshake und Token-Verwaltung für Google Calendar.
 *
 * Flow: connect → Google-Consent → callback (Code→Tokens) → in DB gespeichert.
 * Danach liefert `getValidAccessToken()` bei jedem Sync ein gültiges
 * Access-Token und erneuert es bei Bedarf über den Refresh-Token.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import {
  GOOGLE_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
} from "./config";
import { decryptToken, encryptToken } from "./crypto";

export type GoogleAccount = typeof googleAccounts.$inferSelect;

// ---------------------------------------------------------------------------
// CSRF-State (zustandslos, signiert) — übersteht den domainübergreifenden
// Rücksprung von Google zuverlässig, ohne auf ein Cookie angewiesen zu sein.
// ---------------------------------------------------------------------------

function stateSecret(): string {
  return (
    process.env.GOOGLE_TOKEN_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "sascha-oauth-fallback"
  );
}

/** Erzeugt einen signierten State: `${timestamp}.${hmac}`. */
export function createOAuthState(): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", stateSecret()).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

/** Prüft Signatur und Alter (max. 10 Minuten) des States. */
export function verifyOAuthState(state: string | null): boolean {
  if (!state) return false;
  const dot = state.indexOf(".");
  if (dot < 0) return false;
  const ts = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", stateSecret()).update(ts).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Baut die Google-Consent-URL, zu der wir den Nutzer weiterleiten. */
export function buildAuthUrl(origin: string, state: string): string {
  const clientId = googleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID ist nicht gesetzt.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // Refresh-Token anfordern
    prompt: "consent", // erzwingt Refresh-Token auch bei Re-Auth
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
};

/** Tauscht den Authorization-Code gegen Access-/Refresh-Token. */
export async function exchangeCodeForTokens(
  origin: string,
  code: string,
): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId()!,
      client_secret: googleClientSecret()!,
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token-Austausch fehlgeschlagen: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Holt die E-Mail-Adresse des verbundenen Kontos (für die Anzeige). */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** Speichert eine frische Verbindung (nach dem Callback). */
export async function saveConnection(
  orgId: string,
  tokens: TokenResponse,
  email: string | null,
): Promise<void> {
  if (!tokens.refresh_token) {
    throw new Error(
      "Google hat keinen Refresh-Token geliefert. Verbindung in den Google-Kontoeinstellungen entfernen und erneut verbinden.",
    );
  }
  const expiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000);
  const values = {
    email,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    tokenExpiry: expiry,
    syncToken: null,
    lastError: null,
    updatedAt: new Date(),
  };
  await db
    .insert(googleAccounts)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: googleAccounts.orgId, set: values });
}

export async function getGoogleAccount(orgId: string): Promise<GoogleAccount | null> {
  const rows = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.orgId, orgId))
    .limit(1);
  return rows[0] ?? null;
}

export async function disconnectGoogle(orgId: string): Promise<void> {
  await db.delete(googleAccounts).where(eq(googleAccounts.orgId, orgId));
}

/** Erneuert das Access-Token über den Refresh-Token und persistiert es. */
async function refreshAccessToken(account: GoogleAccount): Promise<string> {
  const refreshToken = decryptToken(account.refreshToken);
  if (!refreshToken) throw new Error("Kein Refresh-Token gespeichert.");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId()!,
      client_secret: googleClientSecret()!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token-Refresh fehlgeschlagen: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  const expiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await db
    .update(googleAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      tokenExpiry: expiry,
      updatedAt: new Date(),
    })
    .where(eq(googleAccounts.id, account.id));
  return data.access_token;
}

/**
 * Liefert ein gültiges Access-Token für die Org — erneuert automatisch,
 * wenn es abgelaufen ist. Wirft, wenn keine Verbindung besteht.
 */
export async function getValidAccessToken(account: GoogleAccount): Promise<string> {
  const notExpired =
    account.tokenExpiry && account.tokenExpiry.getTime() > Date.now();
  const current = decryptToken(account.accessToken);
  if (notExpired && current) return current;
  return refreshAccessToken(account);
}
