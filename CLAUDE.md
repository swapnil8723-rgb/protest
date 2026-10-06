# LOUD — protest tracker (protesttracker.online)

Read `PLAN.md` §0 first (what changed from the original plan and why), then `DESIGN.md` for anything visual.

## Tone rules (verbatim from the plan — every session follows them)

The humour lives in the interface and the brand, never in how protesters, victims or causes are described. People get arrested, injured and killed at protests; one mocking card going viral would sink the brand.

1. Joke about the format, not the people. Playful labels, loading lines and empty states are fine ("No protests here. Suspiciously quiet."). Summaries of causes and demands stay neutral and factual.
2. Serious Mode switches on automatically. When an event reports deaths, serious injuries or mass arrests, its card drops the bright palette, stickers and jokes, and shows a calm grey-and-white layout. The AI pipeline sets a severity field that drives this.
3. Both sides, with receipts. Every summary states the protesters' demands and the government or authority response, each linked to sources. No adjectives like "brave" or "violent mob".
4. City-level locations only. Pins sit at city or district centroids, never exact gathering points or live movement. No protester names or faces.
5. India's official borders. Use a map provider with an India worldview so J&K and Arunachal display correctly.
6. Original text only. AI writes fresh summaries and links out; never copy article text or photos.
7. Confidence on every card. Show source count, a confidence score and "last verified" time. Unverified single-source reports stay hidden.

House interpretation of rule 4: organisations, parties, elected officials and police/government spokespeople may be named; ordinary participants, students, the injured, detained or dead are never named.

## Architecture
- **Pipeline** (`pipeline/`, plain Node 22+ TypeScript, no build step): `run.ts` = discover (GDELT + RSS) → fetch article → keyword gate → AI classify → geocode (GeoNames gazetteer) → match/create event → AI summary (≥ 2 independent publishers) → deterministic score (`score.ts`) → Telegram review → save.
- **Data** lives in `./data` (gitignored on `main`; the CI checks out the orphan `data` branch there). `events/<id>.json` is the site's only input. Article text is never written to `data/`.
- **Site** (`src/`, Astro 7 static + Tailwind 4): reads `data/` at build. Domain/brand only in `src/site.ts`.
- **Deploy**: `.github/workflows/pipeline.yml` every 30 min → pipeline → commit `data` → build → Cloudflare Pages direct upload → IndexNow.

## Rules for changing things
- Vibe/status/confidence/review numbers live in `pipeline/config.ts` `RULES` and are explained on `/how-we-know` — change both together.
- Prompts (`pipeline/prompts.ts`) encode the tone rules; never loosen them to get more events published.
- Never publish a number without a source (`summarize.ts` drops it) and never show single-publisher events.
- A slug never changes once set (URLs are forever). Wrapped-up events stay as archive pages.
- Maps: `scripts/build-map.ts` erases India's area from every other country (Natural Earth IND view overlaps). Re-run the PoK/Aksai Chin/Tawang point checks after touching it.
- Motion: only the three animations in DESIGN.md §7, all off under `prefers-reduced-motion`.

## Commands
`npm run pipeline` (needs `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`; `AI_PROVIDER=replay` for offline) · `npm run build` · `npm test` · `npm run shot -- <dir> <width> <paths…>` (needs `npm run preview`).
