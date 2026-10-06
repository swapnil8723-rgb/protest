# LOUD: live protest tracker

**protesttracker.online**: *Where the world is getting loud right now.*

Every protest in India and 10 more countries, explained in 10 seconds: why, what they want, both sides, and a giant
YES/NO for "is it still on?". Every card is checked against at least two independent newsrooms. Built to run at $0.

- `PLAN.md`: product plan, plus §0 on what changed in the build and why
- `DESIGN.md`: the design system (neo-brutalist candy, Serious Mode)
- `CLAUDE.md`: tone rules and working rules for AI coding sessions

## How it works

```
GDELT 2.0 (15-min, CAMEO 14) ─┐
Indian newsroom RSS ──────────┼─► fetch article ─► keyword gate ─► AI classify ─► GeoNames city ─► event
                              │                                                                    │
                              └──────────── ≥ 2 independent publishers ◄──────────────────────────┘
                                                   │
                                     AI summary (sources numbered) ─► rules: vibe · still on? · Serious Mode · confidence
                                                   │
                                     Telegram review (flagged only) ─► data/ on main ─► Vercel build & deploy ─► IndexNow
```

## Run locally

```bash
npm ci
npm test
GEMINI_API_KEY=... npm run pipeline        # or ANTHROPIC_API_KEY=..., or AI_PROVIDER=replay
npm run build && npm run preview           # http://127.0.0.1:4321
```

`data/` is the pipeline's database (JSON), committed to `main`.

## Go live

Live at **https://protesttracker.online** (domain at Namecheap: A `@` → 76.76.21.21, CNAME `www` → cname.vercel-dns.com;
`www` and `protesttracker.vercel.app` redirect to it). Code on GitHub (`swapnil8723-rgb/protest`, data in `data/` on `main`),
Vercel project `protest` connected to it — every push to `main` deploys.

1. **Gemini key** (free): https://aistudio.google.com/apikey → GitHub repo → Settings → Secrets → Actions →
   `GEMINI_API_KEY`. The hourly workflow starts doing work as soon as this exists.
2. Optional secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (review from your phone), `ANTHROPIC_API_KEY` (fallback).
   Optional repo variables: `SITE_URL`, `GEMINI_MODEL`, `AI_PROVIDER`.
3. **Search**: add the site to Google Search Console and Bing Webmaster Tools; submit `/sitemap-index.xml` and `/news-sitemap.xml`.
4. **Own domain later** (protesttracker.online, $1.99): add it in Vercel → Domains, then set `SITE_URL` both as a
   Vercel env var and a GitHub repo variable.

Actions minutes: a private repo gets 2,000/month, so the pipeline runs every 3 hours (~6 min a run). Make the repo public to run it hourly.

Backup timer: GitHub's own schedule can skip hours on small repos, so Vercel Cron calls `/api/tick`, which starts the
workflow if no run started in the last 150 minutes. It needs one Vercel env var: `GITHUB_DISPATCH_TOKEN` (GitHub →
Settings → Developer settings → Fine-grained tokens → only this repo → Actions: Read and write).

## Languages
English, हिन्दी, मराठी, Español, Français, Deutsch. Interface text lives in `src/i18n/`; protest cards are translated by the
pipeline (one AI call per changed card, all five languages at once) from the already-checked English. A card shows in
English on a language page until its translation exists. Add a language: a dictionary in `src/i18n/`, an entry in
`LANGS`/`LANG_INFO`, `pipeline/config.ts` `TRANSLATE_TO`, and `src/i18n/how.ts`.

## Reader reports ("Add a protest")
`/add` posts to `api/report.ts`, which stores the report in a private Vercel Blob store (created and linked to the
project; `BLOB_READ_WRITE_TOKEN` and `READER_SALT` are Vercel env vars). The hourly pipeline fetches reports through
`api/inbox.ts`, authenticated by GitHub Actions' OIDC token, so no secret needs copying. Reports at least an hour old get
the automatic check and appear as orange "Reader report" cards. Turn the step off with repo variable `READER_REPORTS=off`.
Blob's free tier allows roughly 2,000 writes a month; past that the form says "busy" until the next month (no charge on Hobby).

## Telegram review (optional, recommended)
Create a bot with @BotFather and message it once. Get your chat id from
`https://api.telegram.org/bot<TOKEN>/getUpdates`. Flagged events (deaths, serious injuries, 100+ arrests, top 10 live,
confidence < 80%, sources disagree, tone words) then wait for your ✅/❌. Without a reviewer, flagged events publish only
with 3+ independent newsrooms and never with tone or low-confidence flags.

## Costs
| | Free tier | Watch |
|---|---|---|
| Gemini | ~1,500 req/day; pipeline caps itself at 1,000 (`AI_DAILY_CAP`) | switch `AI_PROVIDER=anthropic` (Haiku 4.5) if limits bite |
| GitHub Actions | 2,000 min/month private (every 3 h ≈ 1,500), unlimited public | ~6 min per run |
| Vercel Hobby | free, non-commercial | deploys only when pages change or every 2 h |
| Map | own canvas globe, no provider | none |
