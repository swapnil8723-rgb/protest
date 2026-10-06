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

Already done: code on GitHub (`swapnil8723-rgb/protest`, data in `data/` on `main`) and a Vercel project
connected to it — every push to `main` deploys.

1. **Gemini key** (free): https://aistudio.google.com/apikey → GitHub repo → Settings → Secrets → Actions →
   `GEMINI_API_KEY`. The hourly workflow starts doing work as soon as this exists.
2. Optional secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (review from your phone), `ANTHROPIC_API_KEY` (fallback).
   Optional repo variables: `SITE_URL`, `GEMINI_MODEL`, `AI_PROVIDER`.
3. **Search**: add the site to Google Search Console and Bing Webmaster Tools; submit `/sitemap-index.xml` and `/news-sitemap.xml`.
4. **Own domain later** (protesttracker.online, $1.99): add it in Vercel → Domains, then set `SITE_URL` both as a
   Vercel env var and a GitHub repo variable.

Actions minutes: a private repo gets 2,000/month, so the pipeline runs hourly. Make the repo public to run it every 30 minutes.

## Telegram review (optional, recommended)
Create a bot with @BotFather and message it once. Get your chat id from
`https://api.telegram.org/bot<TOKEN>/getUpdates`. Flagged events (deaths, serious injuries, 100+ arrests, top 10 live,
confidence < 80%, sources disagree, tone words) then wait for your ✅/❌. Without a reviewer, flagged events publish only
with 3+ independent newsrooms and never with tone or low-confidence flags.

## Costs
| | Free tier | Watch |
|---|---|---|
| Gemini | ~1,500 req/day; pipeline caps itself at 1,000 (`AI_DAILY_CAP`) | switch `AI_PROVIDER=anthropic` (Haiku 4.5) if limits bite |
| GitHub Actions | 2,000 min/month private (hourly fits), unlimited public | ~1–2 min per run |
| Vercel Hobby | free, non-commercial | deploys only when pages change or every 2 h |
| Map | own canvas globe, no provider | none |
