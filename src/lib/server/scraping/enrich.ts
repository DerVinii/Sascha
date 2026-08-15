/**
 * Lead-Enrichment via Gemini (mit eingebautem Google-Search-Grounding).
 *
 * Bildet den unteren n8n-Workflow ab ("Message a model" + Code-Node): zu einem
 * Unternehmen den Geschäftsführer (Vor-/Nachname) und die geschäftliche
 * E-Mail-Adresse recherchieren. Antwort als striktes JSON, das geparst wird.
 *
 * Gibt der Ordner eine Zielrolle vor (z. B. "Akademieleitung"), wird stattdessen
 * der standortbezogene Prompt genutzt: Große Träger haben viele Standorte, und
 * gesucht ist dann die Leitung genau dieses Standorts statt der Zentrale.
 */

/**
 * JSON-Format- und "nur JSON"-Anweisungen. Bewusst geteilt: parseResult setzt
 * genau auf dieses Format auf, beide Prompts müssen es wortgleich verlangen.
 */
const JSON_ANWEISUNG = `Gib das Ergebnis im JSON-Format mit folgenden Schlüsselpaaren aus:
{
 "Vorname":"Max",
 "Nachname":"Mustermann",
 "email":"max@firma.de"
}

Wenn du keine Person finden kannst, gib im Output bei "Vorname", "Nachname" und "email" nur "NF".

WICHTIG: Sage absolut nichts anderes außer der gewünschten Ausgabe. Erstelle nur den Output als angefordertes JSON. Schreibe KEINEN Text, sondern antworte NUR im beschriebenen JSON-Format!`;

const SYSTEM_PROMPT = `Du bist ein hilfreicher Experten-Researcher. Deine Aufgabe ist es, uns dabei zu helfen, den Geschäftsführer eines vom Nutzer angegebenen Unternehmens zu finden.

Du hast Zugriff auf die Google-Suche, um im Internet nach diesen Informationen zu suchen. Du erhältst weitere Details, die dir bei der Recherche helfen, wie zum Beispiel die Website und den Link zum Google Maps, sofern verfügbar.

Recherchiere für die gefundene Person auch deren geschäftliche E-Mail-Adresse. Suche dazu gezielt auf der Firmenwebseite (z.B. Impressum, Kontaktseite, Über-uns-Seite) und über weitere Quellen. Wenn du die Emailadresse der Person nicht finden kannst, nimm die öffentliche Emailadresse des Unternehmens. Wenn du keine E-Mail-Adresse finden kannst, setze den Wert auf "NF".

${JSON_ANWEISUNG}`;

/**
 * Standortbezogener Prompt: sucht die angegebene Funktion (z. B. "Akademie-
 * leitung") für genau den Standort der Zeile — nicht die Zentrale.
 */
function rollenSystemPrompt(zielrolle: string): string {
  return `Du bist ein hilfreicher Experten-Researcher. Deine Aufgabe ist es, für den unten angegebenen Standort eines Unternehmens die zuständige Person in folgender Funktion zu finden: ${zielrolle} (oder eine gleichwertige Funktionsbezeichnung).

WICHTIG: Große Träger und Unternehmen haben viele Standorte. Gesucht ist NICHT die Geschäftsführung oder Leitung des Gesamtunternehmens, sondern die verantwortliche Person genau dieses Standorts (siehe Adresse). Findest du nur die Geschäftsführung der Zentrale, gib "NF" aus.

Du hast Zugriff auf die Google-Suche. Vorgehen:
1. Suche auf der Firmenwebseite die Unterseite genau dieses Standorts (oft unter „Standorte" verlinkt, häufig mit dem Stadtnamen in der URL). Dort stehen die Ansprechpartner mit Funktion und oft auch E-Mail-Adresse — häufig ganz unten auf der Standortseite.
2. Suche zusätzlich bei Google nach „<Firmenname> <Stadt> ${zielrolle}".
3. Gibt es mehrere passende Personen (z. B. Leitung und stellvertretende Leitung), nimm die Leitung.

Recherchiere für die gefundene Person auch deren geschäftliche E-Mail-Adresse (Standortseite, Impressum, Kontaktseite). Die E-Mail-Adresse muss zur gefundenen Person gehören — gib NIEMALS die E-Mail-Adresse einer anderen Person aus. Wenn du die persönliche E-Mail-Adresse der Person nicht finden kannst, nimm die öffentliche E-Mail-Adresse dieses Standorts (nicht die der Zentrale). Wenn du keine E-Mail-Adresse finden kannst, setze den Wert auf "NF".

${JSON_ANWEISUNG}`;
}

export type EnrichmentInput = {
  firmenname: string;
  webseite?: string | null;
  gmapsUrl?: string | null;
  /** Adresse des Standorts — nur im Rollen-Modus Teil des Prompts. */
  adresse?: string | null;
  /** Gesuchte Funktion am Standort. Leer/null = Geschäftsführung (Standard). */
  zielrolle?: string | null;
};

export type EnrichmentResult = {
  vorname: string; // "NF" wenn nicht gefunden
  nachname: string;
  email: string;
  found: boolean;
};

const NOT_FOUND: EnrichmentResult = {
  vorname: "NF",
  nachname: "NF",
  email: "NF",
  found: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasName(x: any): boolean {
  return (
    !!x &&
    (String(x.Vorname ?? x.vorname ?? "NF").toUpperCase() !== "NF" ||
      String(x.Nachname ?? x.nachname ?? "NF").toUpperCase() !== "NF")
  );
}

function parseResult(raw: string): EnrichmentResult {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // Bei mehreren Geschäftsführer-Kandidaten liefert das Modell (trotz Prompt)
    // manchmal ein JSON-Array statt eines Einzelobjekts. Erst Array probieren,
    // dann Einzelobjekt — sonst würde ein greedy {…}-Match das Array zerreißen
    // und ein echter Treffer fälschlich als "nicht gefunden" gewertet.
    let parsed: unknown = null;
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch {
        parsed = null;
      }
    }
    if (parsed == null) {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(objMatch ? objMatch[0] : cleaned);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let person: any = parsed;
    if (Array.isArray(parsed)) {
      // erste Person mit echtem Namen, sonst das erste Element
      person = parsed.find(hasName) ?? parsed[0] ?? {};
    }
    if (!person || typeof person !== "object") return NOT_FOUND;

    const vorname = String(person.Vorname ?? person.vorname ?? "NF").trim();
    const nachname = String(person.Nachname ?? person.nachname ?? "NF").trim();
    const email = String(person.email ?? person.Email ?? "NF").trim();

    const found =
      vorname.toUpperCase() !== "NF" ||
      nachname.toUpperCase() !== "NF" ||
      (email.toUpperCase() !== "NF" && email.includes("@"));

    return { vorname, nachname, email, found };
  } catch {
    return NOT_FOUND;
  }
}

export async function enrichLead(
  input: EnrichmentInput,
): Promise<EnrichmentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY fehlt in .env.local — Lead-Enrichment nicht möglich.",
    );
  }
  // Ohne Zielrolle bleibt alles exakt wie bisher (gleicher Prompt, gleicher
  // userText ohne Adresszeile) — bestehende Ordner verhalten sich unverändert.
  const zielrolle = input.zielrolle?.trim() || "";

  // Modellwahl: Der Rollen-Modus muss die Standortseite wirklich lesen und
  // Name↔E-Mail korrekt zuordnen — flash-lite vermischt dort im Test Personen
  // und Adressen aus den Suchsnippets. Deshalb dort ein stärkeres Modell.
  const model = zielrolle
    ? process.env.GEMINI_MODEL_ZIELROLLE || "gemini-3.5-flash"
    : process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  const userText = zielrolle
    ? `Firmenname: ${input.firmenname}\n` +
      `Webseite: ${input.webseite ?? ""}\n` +
      `Google Maps Link: ${input.gmapsUrl ?? ""}\n` +
      `Adresse des Standorts: ${input.adresse ?? ""}\n` +
      `Gesuchte Funktion: ${zielrolle}\n`
    : `Firmenname: ${input.firmenname}\n` +
      `Webseite: ${input.webseite ?? ""}\n` +
      `Google Maps Link: ${input.gmapsUrl ?? ""}\n`;

  const systemPrompt = zielrolle ? rollenSystemPrompt(zielrolle) : SYSTEM_PROMPT;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3 },
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Gemini API ${res.status}: ${detail.slice(0, 300) || res.statusText}`,
    );
  }

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p?.text)
    .filter(Boolean)
    .join("")
    .trim();

  if (!text) return NOT_FOUND;
  return parseResult(text);
}
