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
                                     Telegram review (flagged only) ─► data branch ─► Astro build ─► Cloudflare Pages ─► IndexNow
```

## Run locally

```bash
npm ci
npm test
GEMINI_API_KEY=... npm run pipeline        # or ANTHROPIC_API_KEY=..., or AI_PROVIDER=replay
npm run build && npm run preview           # http://127.0.0.1:4321
```

`data/` is the pipeline's database (JSON). In CI it is the orphan `data` branch.

## Go live (one-time, ~20 minutes, $1.99)

1. **Domain**: register `protesttracker.online` (Vercel shows $1.99 first year, $27 renewal; Namecheap is similar).
2. **GitHub**: create a **public** repo (public = unlimited Actions minutes; a private repo would need ~3,000 min/month) and push `main`.
3. **Cloudflare Pages**: create a project named `loud` with *Direct Upload*, add the custom domain, and create an API token with *Cloudflare Pages: Edit*.
4. **Gemini key** (free): https://aistudio.google.com/apikey
5. **Repo secrets**: `GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; optional `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`.
   Repo variables (optional): `SITE_URL`, `GEMINI_MODEL`, `AI_PROVIDER`, `CF_PAGES_PROJECT`.
6. **Seed data**: push the local `data/` folder as the `data` branch (see below), then run the workflow once by hand.
7. **Search**: add the domain to Google Search Console and Bing Webmaster Tools and submit `/sitemap-index.xml` and `/news-sitemap.xml`.

```bash
cd data && git init -b data && git add -A && git commit -m "seed" \
  && git remote add origin <repo-url> && git push -u origin data
```

## Telegram review (optional, recommended)
Create a bot with @BotFather and message it once. Get your chat id from
`https://api.telegram.org/bot<TOKEN>/getUpdates`. Flagged events (deaths, serious injuries, 100+ arrests, top 10 live,
confidence < 80%, sources disagree, tone words) then wait for your ✅/❌. Without a reviewer, flagged events publish only
with 3+ independent newsrooms and never with tone or low-confidence flags.

## Costs
| | Free tier | Watch |
|---|---|---|
| Gemini | ~1,500 req/day; pipeline caps itself at 1,000 (`AI_DAILY_CAP`) | switch `AI_PROVIDER=anthropic` (Haiku 4.5) if limits bite |
| GitHub Actions | unlimited on public repos | ~2–4 min per run |
| Cloudflare Pages | unlimited static requests | deploys only when pages change or every 2 h |
| Map | own canvas globe, no provider | none |
