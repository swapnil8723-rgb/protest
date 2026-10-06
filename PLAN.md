# LOUD — Protest Tracker Phase 1 Build Plan
Oct 5, 2026 · @Swapnil sawandkar

> **Read §0 first.** It records where the build deliberately departs from the original plan below (stack, domain,
> map, database) and why. Everything else in the original plan still applies.

## 0. Build decisions (Oct 5, 2026) — supersede the original where they conflict

| Original plan | Built as | Why |
|---|---|---|
| protest.citylens.lol subdomain | **protesttracker.online** (brand stays **LOUD**) — set only in `src/site.ts` | Exact-match "protest tracker" domain, $1.99 first year / $27 renewal. `loud.online` is premium ($550/yr renewal). |
| Next.js + shadcn on Vercel Hobby | **Astro 7 static + Tailwind 4**, deployed to **Cloudflare Pages** by direct upload from GitHub Actions | Pure static HTML = best Core Web Vitals and zero server cost. Cloudflare Pages free tier allows commercial use (Vercel Hobby does not). Direct uploads avoid the 500-builds/month Git-build limit. |
| Supabase Postgres + PostGIS | **Git as the database**: JSON files on an orphan `data` branch, committed by the pipeline | No idle-pause, no 500 MB cap, full history/audit trail of every change to every event, nothing to keep alive. ~100s of events fit easily. |
| Mapbox GL globe, India worldview | **Own canvas globe** (d3-geo orthographic) on **Natural Earth "IND" point-of-view boundaries** | $0 forever (no 50k-load cap, no token), ~35 KB JS, J&K / Ladakh / Arunachal shown per India's official position, and it can be styled exactly to the design system. Pins are city centroids only. |
| GDELT city = event location | **GDELT is URL discovery only.** Each article is fetched, classified and located from its own text; city resolved against a GeoNames gazetteer | Sampling 4 Oct 2026: GDELT placed the Mumbai Thackeray march in "Shiv, Rajasthan" and "Garjana, Bangladesh", coded "Pakistan lodges protest with India" and a Trump rally as protests. Accuracy needs article-level checks. |
| "≥2 sources" | **≥2 independent publishers**, after removing syndication farms and near-identical wire copies | Big News Network sites (asiabulletin.com, austinglobe.com…) re-post the same wire story and would fake corroboration. |
| @vercel/og at request time | **Satori + resvg at build time**, cached by content hash | Same art, no runtime functions. |
| Telegram webhook | **Telegram polling** from the pipeline run (`getUpdates`) | No server needed for Approve/Reject buttons. |
| Gemini 2.5 Flash | Provider switch in `pipeline/ai.ts`: `gemini` (default, model from `GEMINI_MODEL`) · `anthropic` (Claude Haiku 4.5) · `replay` (tests/manual seed) | One-line switch as the plan asked. |

Target countries (edit in `pipeline/config.ts`): India + United States, United Kingdom, France, Germany, Spain,
Pakistan, Bangladesh, Nepal, Kenya, Indonesia.

---

## The big idea
Build LOUD: a live, neutral protest tracker that explains every protest in under 10 seconds, packaged like a Gen Z
social app instead of a research dashboard.

**Tagline:** Where the world is getting loud right now.

**Positioning.** Existing trackers fall into two camps. Data and research sites (Carnegie, ACLED, GDELT,
GlobalProtestTracker, MomentumProtests) are accurate but dry. War-first live maps (Liveuamap, WarMap) treat protests
as one layer among conflicts. India-focused Satyamap is the closest local rival. Nobody owns protests as a fun,
scrollable, shareable consumer product. That is the gap.

The product is the event card, not the map. Every protest gets a card that answers four questions instantly: what is
happening, why, what they want, and is it still going on. The map and globe are the visual hook; the cards and event
pages carry the SEO traffic.

**Phase 1 scope:** a lean $0 build. India plus 5 to 10 major countries, 50 to 100 real events at launch, 6 pages and
6 core features, fully automated, with human review only for flagged events.

Name options if LOUD does not land: Hullabaloo, Andolan, ProtestPulse, Uproar.

## Tone rules: funny UI, serious facts
The humour lives in the interface and the brand, never in how protesters, victims or causes are described. People get
arrested, injured and killed at protests; one mocking card going viral would sink the brand.

1. **Joke about the format, not the people.** Playful labels, loading lines and empty states are fine ("No protests here. Suspiciously quiet."). Summaries of causes and demands stay neutral and factual.
2. **Serious Mode switches on automatically.** When an event reports deaths, serious injuries or mass arrests, its card drops the bright palette, stickers and jokes, and shows a calm grey-and-white layout. The AI pipeline sets a severity field that drives this.
3. **Both sides, with receipts.** Every summary states the protesters' demands and the government or authority response, each linked to sources. No adjectives like "brave" or "violent mob".
4. **City-level locations only.** Pins sit at city or district centroids, never exact gathering points or live movement. No protester names or faces.
5. **India's official borders.** Use a map provider with an India worldview so J&K and Arunachal display correctly.
6. **Original text only.** AI writes fresh summaries and links out; never copy article text or photos.
7. **Confidence on every card.** Show source count, a confidence score and "last verified" time. Unverified single-source reports stay hidden.

## Gen Z features (Phase 1: six core)
| # | Feature | What it does |
|---|---|---|
| 1 | Vibe Check status | Heating up, Peak loud, Cooling down, Wrapped up, Tense (Serious Mode) as a coloured sticker |
| 2 | The Tea (TL;DR card) | Why they are mad, what they want, what changed recently |
| 3 | Globe home | Globe with pulsing pins on live protests; tap to fly in |
| 4 | Receipts | Sources, confidence score and last-verified time, inside the event page |
| 5 | Is it still on? | Giant YES or NO at the top of every event page, with "last confirmed X minutes ago" |
| 6 | Story cards and OG images | One-tap 9:16 image for Instagram/WhatsApp stories, plus OG images for X links |

Also in Phase 1: Serious Mode, cause stickers as tags and filters, a plain update timeline on each event page.
Navigation: Home → Today → Event → City or Country.

Moved to Phase 2: Loud Feed swipe view, Group Chat timeline styling, Same Energy, Loudness Forecast, Loud Wrapped,
cause pages, web push follow, Hindi version, accounts and user submissions.

## Pages and SEO structure
| Page | URL pattern | Targets searches like |
|---|---|---|
| Home (globe + live list) | `/` | protest map, protests today |
| Today (explore) | `/today` | protests today worldwide; filter by country and cause |
| Event page | `/p/[slug]` e.g. `/p/mumbai-voter-roll-protest-oct-2026` | [movement] protest latest update, is it still going on |
| City page | `/[cc]/[state]/[city]` e.g. `/in/maharashtra/mumbai` | Mumbai protest today |
| Country page | `/country/[country]` | France protest today |
| How we know | `/how-we-know` | Trust signal for readers, Google and press |

SEO essentials: static pages with the TL;DR in the first 100 words and the event date in the title; Event and
NewsArticle structured data with `dateModified` on every pipeline change; sitemap split by country; IndexNow for
Bing; OG image per event; resolved events stay live as archive pages.

## Data pipeline (every 30 minutes)
Status rules:
- **Heating up:** more reports in the last 24 hours than the 24 hours before
- **Peak loud:** top 10% of live events by report volume
- **Cooling down:** report volume falling for 24 hours
- **Wrapped up:** no new reports for 48 hours, or an explicit end (demands met, called off)
- **Tense, Serious Mode on:** any deaths, serious injuries or mass arrests reported

Human review only when it matters (Telegram Approve / Reject): deaths, injuries or mass arrests; the 10 biggest live
events; confidence below 0.8; sources that disagree on status or numbers. Target: under 10 reviews a day.

AI budget rule: capped at 1,000 calls a day, one summary call per event re-run only when new sources arrive, several
articles batched per call, provider behind a one-line switch.

## Costs ($0 to start)
| Item | Free option | Start paying when |
|---|---|---|
| AI summaries | Gemini free tier | limits block updates → Claude Haiku (~$10–30/mo) |
| Pipeline jobs | GitHub Actions (public repo = unlimited minutes) | never in Phase 1 |
| Hosting | Cloudflare Pages free | never in Phase 1 |
| Map | own globe | never |
| Review alerts | Telegram Bot API | never |
| Domain | protesttracker.online | $1.99 first year, $27 renewal |

## Phase 1 success, 4 weeks after launch
$0 spent · 300+ pages indexed · ongoing events re-checked every 30–60 min · 10,000+ visits/month ·
2%+ of event views end in a share · < 10 manual reviews a day · zero tone incidents.
