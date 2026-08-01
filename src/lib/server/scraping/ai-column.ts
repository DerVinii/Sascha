/**
 * "Mit KI ausfüllen" (Claygent-Stil): füllt eine Spalte pro Zeile anhand eines
 * freien Nutzer-Prompts. Modell ist fest **gemini-2.5-flash-lite** (Vorgabe),
 * mit Google-Search-Grounding, damit die KI auch im Web recherchieren kann.
 *
 * Rückgabe: der reine Zellwert als String ("NF" wenn nichts gefunden).
 */

const MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT = `Du bist ein präziser Recherche-Assistent in einer Tabelle (wie Clay/Claygent).
Dir werden die Daten EINER Tabellenzeile als JSON gegeben sowie eine Aufgabe des Nutzers.
Nutze bei Bedarf die Google-Suche, um die Aufgabe zu erfüllen.

Antworte AUSSCHLIESSLICH mit dem reinen Ergebniswert für diese eine Zelle:
- kein Fließtext, keine Erklärung, keine Anführungszeichen, kein Markdown.
- nur der Wert (z. B. eine URL, ein Name, eine Zahl, ein kurzer Text).
- Wenn du nichts Belastbares findest, antworte exakt mit: NF`;

export async function runAiColumn(
  prompt: string,
  rowContext: Record<string, unknown>,
  /** search: false schaltet das Google-Grounding ab (spart Zeit, wenn die
   *  Aufgabe reines Modellwissen ist — z. B. die Anrede aus dem Vornamen). */
  opts?: { search?: boolean },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY fehlt zur Laufzeit — KI-Spalte nicht möglich.");
  }

  const userText =
    `Zeilendaten (JSON):\n${JSON.stringify(rowContext, null, 0)}\n\n` +
    `Aufgabe:\n${prompt.trim()}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        tools: opts?.search === false ? undefined : [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
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
    .trim()
    // evtl. Markdown-Codefences/Quotes entfernen
    .replace(/^```[a-z]*\n?|```$/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  return text || "NF";
}
