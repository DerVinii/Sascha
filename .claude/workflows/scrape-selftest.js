export const meta = {
  name: 'scrape-selftest',
  description: 'Testet den Lead-Scraping-Workflow (Scrape + Enrichment) end-to-end auf Produktion in Schleife, bis alles grün ist; diagnostiziert Fehler.',
  whenToUse: 'Nach Änderungen am Scraping/Enrichment oder bei gemeldeten Fehlern — prüft die echte Prod-Pipeline via /api/scrape-selftest.',
  phases: [
    { title: 'Test', detail: 'Scrape- & Enrichment-Szenarien gegen Produktion curlen' },
    { title: 'Diagnose', detail: 'Falls rot: Ursache bestimmen + Fix vorschlagen' },
  ],
}

const base = (args && args.base) || 'https://sascha-one.vercel.app'
// Gate-Token NICHT im Skript (public Repo) — Agenten lesen es zur Laufzeit aus .env.local.
const ENV_PATH = '/home/vini/Sascha/.env.local'

const SCENARIOS = [
  { label: 'scrape:Dachdecker Magdeburg', path: `/api/scrape-selftest?niche=Dachdecker&city=Magdeburg` },
  { label: 'scrape:Zahnarzt Berlin', path: `/api/scrape-selftest?niche=Zahnarzt&city=Berlin` },
  { label: 'scrape:Friseur Hamburg', path: `/api/scrape-selftest?niche=Friseur&city=Hamburg` },
  { label: 'enrich:Dachdecker Magdeburg', path: `/api/scrape-selftest?mode=enrich&niche=Dachdecker&city=Magdeburg` },
  { label: 'ai:Stadt aus Adresse', path: `/api/scrape-selftest?mode=ai&niche=Dachdecker&city=Magdeburg&prompt=${encodeURIComponent('Nenne die Stadt aus der Adresse in genau einem Wort.')}` },
]

const TEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    ok: { type: 'boolean', description: 'true NUR wenn HTTP 200 und JSON-Feld "ok":true und kein "error"' },
    http: { type: 'number' },
    summary: { type: 'string', description: 'kurz: count / enrich-Ergebnis / oder die Fehlermeldung' },
  },
  required: ['label', 'ok', 'summary'],
}

function testPrompt(s) {
  return `Führe in Bash GENAU diese Befehle aus (das Gate-Token aus .env.local lesen und an die URL anhängen):
TOK=$(grep '^SELFTEST_TOKEN=' ${ENV_PATH} | cut -d= -f2-)
curl -s -m 70 -w "\\nHTTP:%{http_code}" "${base}${s.path}&t=$TOK"

Werte die Antwort aus und gib das Ergebnis strukturiert zurück:
- label = "${s.label}"
- http = der HTTP-Statuscode
- ok = true NUR wenn HTTP 200 UND der JSON-Body \`"ok":true\` enthält UND kein \`"error"\`-Feld gesetzt ist.
- summary = bei Erfolg kurz "count=<n>" bzw. für enrich "found=<bool>, hasEmail=<bool>" bzw. für ai den zurückgegebenen Wert; bei Fehler den exakten error-Text bzw. HTTP-Status.
Erfinde nichts — nur was die Antwort hergibt.`
}

const MAX_ROUNDS = 4
let round = 0
let results = []
let allGreen = false

while (round < MAX_ROUNDS && !allGreen) {
  round++
  results = await parallel(
    SCENARIOS.map((s) => () =>
      agent(testPrompt(s), {
        label: `r${round}:${s.label}`,
        phase: 'Test',
        schema: TEST_SCHEMA,
        agentType: 'general-purpose',
      }),
    ),
  )
  const clean = results.filter(Boolean)
  const green = clean.filter((r) => r.ok).length
  allGreen = clean.length === SCENARIOS.length && green === SCENARIOS.length
  log(`Runde ${round}: ${green}/${SCENARIOS.length} grün`)

  if (!allGreen && round < MAX_ROUNDS) {
    // kurze Pause (Deploy/Transient/Rate-Limit) vor dem nächsten Versuch
    await agent('Führe aus: sleep 25 && echo gewartet. Gib nur "ok" zurück.', {
      label: `warte-${round}`,
      phase: 'Test',
      agentType: 'general-purpose',
    })
  }
}

let diagnosis = null
if (!allGreen) {
  diagnosis = await agent(
    `Der Lead-Scraping-Self-Test ist nach ${round} Runden nicht vollständig grün. Hier die letzten Ergebnisse als JSON:\n${JSON.stringify(results, null, 2)}\n\nBestimme die WAHRSCHEINLICHSTE Ursache (Kategorie: env-fehlt | google-api | gemini-api | db | timeout | skew/cache | code) und nenne den konkreten nächsten Fix in 2-3 Sätzen. Sei präzise.`,
    { label: 'diagnose', phase: 'Diagnose' },
  )
}

return { rounds: round, allGreen, results: results.filter(Boolean), diagnosis }
