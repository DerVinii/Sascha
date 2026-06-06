/**
 * Lead-Enrichment via Gemini (mit eingebautem Google-Search-Grounding).
 *
 * Bildet den unteren n8n-Workflow ab ("Message a model" + Code-Node): zu einem
 * Unternehmen den Geschäftsführer (Vor-/Nachname) und die geschäftliche
 * E-Mail-Adresse recherchieren. Antwort als striktes JSON, das geparst wird.
 */

const SYSTEM_PROMPT = `Du bist ein hilfreicher Experten-Researcher. Deine Aufgabe ist es, uns dabei zu helfen, den Geschäftsführer eines vom Nutzer angegebenen Unternehmens zu finden.

Du hast Zugriff auf die Google-Suche, um im Internet nach diesen Informationen zu suchen. Du erhältst weitere Details, die dir bei der Recherche helfen, wie zum Beispiel die Website und den Link zum Google Maps, sofern verfügbar.

Recherchiere für die gefundene Person auch deren geschäftliche E-Mail-Adresse. Suche dazu gezielt auf der Firmenwebseite (z.B. Impressum, Kontaktseite, Über-uns-Seite) und über weitere Quellen. Wenn du die Emailadresse der Person nicht finden kannst, nimm die öffentliche Emailadresse des Unternehmens. Wenn du keine E-Mail-Adresse finden kannst, setze den Wert auf "NF".

Gib das Ergebnis im JSON-Format mit folgenden Schlüsselpaaren aus:
{
 "Vorname":"Max",
 "Nachname":"Mustermann",
 "email":"max@firma.de"
}

Wenn du keine Person finden kannst, gib im Output bei "Vorname", "Nachname" und "email" nur "NF".

WICHTIG: Sage absolut nichts anderes außer der gewünschten Ausgabe. Erstelle nur den Output als angefordertes JSON. Schreibe KEINEN Text, sondern antworte NUR im beschriebenen JSON-Format!`;

export type EnrichmentInput = {
  firmenname: string;
  webseite?: string | null;
  gmapsUrl?: string | null;
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

function parseResult(raw: string): EnrichmentResult {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    // Robust: erstes JSON-Objekt aus dem Text ziehen.
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);

    const vorname = String(parsed.Vorname ?? parsed.vorname ?? "NF").trim();
    const nachname = String(parsed.Nachname ?? parsed.nachname ?? "NF").trim();
    const email = String(parsed.email ?? parsed.Email ?? "NF").trim();

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
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  const userText =
    `Firmenname: ${input.firmenname}\n` +
    `Webseite: ${input.webseite ?? ""}\n` +
    `Google Maps Link: ${input.gmapsUrl ?? ""}\n`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
