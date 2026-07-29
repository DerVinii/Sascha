import { cookies } from "next/headers";
import { ZUGANG_COOKIE, zugangToken } from "@/lib/zugang-token";

/**
 * Prüft das Passwort-Gate ein zweites Mal — direkt dort, wo es zählt.
 *
 * Die Middleware ist der erste Riegel, aber sie war nie als einziger gedacht:
 * Ihr Matcher ist eine Regex, und ein Fehler darin (wie der frühere
 * `.*\..*`-Ausschluss, über den sich Server Actions per Punkt im Pfad aufrufen
 * ließen) öffnet sonst schlagartig alles. Deshalb prüfen die Actions und Routen,
 * die Personendaten anfassen, zusätzlich selbst.
 *
 * `requireActiveOrg()` ersetzt das NICHT — ohne Anmeldung liefert es immer die
 * erste Organisation und ist damit ein Datenraum-Filter, keine Autorisierung.
 */
export async function hatAppZugang(): Promise<boolean> {
  const passwort = process.env.APP_PASSWORD?.trim();
  // Kein Passwort gesetzt = Gate bewusst aus (lokale Entwicklung).
  if (!passwort) return true;

  const cookie = (await cookies()).get(ZUGANG_COOKIE)?.value;
  return !!cookie && cookie === (await zugangToken(passwort));
}

/** Variante für Server Actions: wirft, wenn der Aufrufer nicht angemeldet ist. */
export async function requireAppZugang(): Promise<void> {
  if (!(await hatAppZugang())) {
    throw new Error("Nicht angemeldet.");
  }
}
