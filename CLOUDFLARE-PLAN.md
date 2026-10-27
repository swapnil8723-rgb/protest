# Moving protesttracker.online from Vercel to Cloudflare

Written 27 Oct 2026. Nothing in this plan has been done yet. Each phase starts only when the owner says so.

## Why now

- Vercel's free plan ran out on 26–27 Oct: Fast Origin Transfer 12.91 / 10 GB, CDN requests 1.1M / 1M, deployment storage 10.13 / 10 GB.
- Vercel's emails say the account will be paused around **27 Oct, 22:45 UTC (28 Oct, 04:15 IST)**, with a second notice for 28 Oct. The pause affects all 6 projects. Usage resets on 1 Nov.
- The owner decided not to upgrade. November would run out the same way, and the free plan forbids the planned Kryvault ad.
- On Cloudflare's free plan, requests for static files are free and unlimited, and commercial use is allowed. The whole move costs $0 and needs no card (see "Why D1, not R2").

## What must not break (checked before every step)

1. **The pipeline.** GitHub Actions keeps running every 3 hours and committing `data/` to `main`. Nothing in this plan changes `pipeline/run.ts`, the AI calls, the commit step or the Actions minutes. The only pipeline edit is one optional setting for the inbox URL (step 2.9).
2. **Live URLs.** Every URL in the sitemaps returns 200, and every old URL in `vercel.json` still returns the same permanent redirect (308, as Vercel does today) to the same place (CLAUDE.md: "Never break a live URL").
3. **Search verification.** The Google Search Console TXT record is copied exactly.
4. **Reader reports.** `/add` → inbox → `pipeline/reader.ts` keeps working, with the same `{ items: [{ id, at, data }] }` shape, so the pipeline needs no change.
5. **Rollback.** Vercel keeps its last deployment and its domain settings for 2 weeks after the switch. The `api/*.ts` Vercel functions stay exactly as they are until cleanup.

### What the pipeline touches, and what happens to each part

| Pipeline touches | Today | During the Vercel pause | After the move |
|---|---|---|---|
| `git push` of `data/` | Vercel builds the push | Commits keep landing; Vercel doesn't build | Cloudflare Workers Builds builds every push |
| `GET/DELETE /api/inbox` (`pipeline/reader.ts`) | Vercel function + Blob | Fails, but **without stopping the run**: `run.ts:179-182` logs "reader: inbox unavailable" and carries on (checked) | Worker + D1, same response shape |
| IndexNow (`scripts/indexnow.ts`) | key file at `/<key>.txt` | pings a host that's down (harmless) | key file still written to `dist` by `postbuild.ts` |
| Backup trigger `api/tick` (Vercel Cron, hourly) | dispatches the workflow if no run for 165 min | **down**: only GitHub's own 3-hourly cron runs, so some gaps are possible | Cloudflare Cron Trigger, hourly at :50 (Cloudflare's crons run on time) |
| Actions minutes | ~6 min/run | same | same: the site is built on Cloudflare, not in Actions |

## What moves where

| Today (Vercel) | Cloudflare (free) | Notes |
|---|---|---|
| Static `dist/` on Vercel CDN | **Worker with static assets** (`wrangler.jsonc` → `assets.directory: ./dist`) | Static requests are free and unlimited; 20,000 files max per version (we have about 1,700) and 25 MiB max per file |
| Git build on push (`vercel.json` buildCommand) | **Workers Builds** linked to the GitHub repo | Free: 3,000 build minutes a month, 1 build at a time, 20-min timeout. Vercel's build takes 2.3 min; expect 3–5 min, about 260 builds a month, about 1,300 min |
| `ignoreCommand` `[skip vercel]` | none: Workers Builds builds every push | Docs don't confirm Workers Builds honours `[skip ci]`. Building every push still fits in 3,000 min |
| `cleanUrls` + `trailingSlash: false` | `html_handling: "drop-trailing-slash"` | Vercel gives 308s today (checked): `/today/` → `/today`, `/today.html` → `/today`. Cloudflare's status codes may differ; checked in Phase 3 |
| 404 page | `not_found_handling: "404-page"` | serves `dist/404.html` with status 404 |
| `vercel.json` `headers` | `dist/_headers` (already written by `postbuild.ts`) + HSTS added | Vercel sends `Strict-Transport-Security: max-age=63072000`; we keep it |
| `vercel.json` `redirects` (128) | `dist/_redirects`, **generated from `vercel.json` by `postbuild.ts`** | `vercel.json` stays the one source, because `merge-events.ts` / `withdraw-events.ts` write to it |
| `api/report.ts` (Vercel function + Blob) | `worker/report.ts` + **D1** | same rules, same error codes |
| `api/inbox.ts` (Vercel function + Blob) | `worker/inbox.ts` + **D1** | same GitHub OIDC check, same JSON |
| `api/tick.ts` + 24 Vercel crons | `scheduled()` in `worker/index.ts`, cron `50 * * * *` | 1 of the 5 free cron triggers |
| `@vercel/analytics` | **Cloudflare Web Analytics** beacon (manual snippet) | Free. Vercel builds keep `<Analytics />` (switched by `process.env.VERCEL`) |
| www → apex 308 (Vercel domain setting) | proxied `www` record + Redirect Rule, **308** (same as today) | |
| Namecheap DNS + Namecheap email forwarding | Cloudflare DNS + **Email Routing** | forwarding stops the moment the nameservers move |

### Why D1, not R2

R2 has a free tier but needs a payment method before it can be turned on. D1 (SQLite) is on the Workers free plan with no card. It reads straight back what was just written, so the 3-reports-per-IP-per-day count stays exact, and listing the inbox is a single query. R2 would be one call per report, against a 50-calls-per-request limit on the free plan. Reader reports are tiny and rare (3/IP/day), far inside D1's free limits (5M reads, 100k writes a day).

### Free-plan limits that matter

- Worker script requests: 100,000 a day. Only `/api/*` reaches the script (`run_worker_first: ["/api/*"]`); pages, images and maps are static and don't count.
- 10 ms of CPU time per request or cron run. Waiting on the network doesn't count, and the RSA check uses built-in WebCrypto.
- 5 cron triggers per account (we use 1).
- `_redirects`: 2,000 static + 100 dynamic rules. We'll have about 63 + 63×5 = **378 static** and **8 dynamic**. The default status is 302, so **every line gets an explicit 308**, the code Vercel sends today (baseline, 27 Oct). Google treats 301 and 308 the same; 308 simply keeps it identical.

## Timeline

Times are given in UTC and IST. Claude Code time means a working session in this repo.

| When | Phase | Who | Active time |
|---|---|---|---|
| **27 Oct, before 22:45 UTC (04:15 IST)** | 0: save what disappears in the pause | Owner + Claude | 30–45 min |
| 27–28 Oct | 1: Cloudflare account, D1, tokens (no DNS change) | Owner + Claude | 30 min |
| 28 Oct | 2: code (worker, redirects, analytics, tests) | Claude Code | 1.5–2 h over 1–2 sessions |
| 28–29 Oct | 3: test on `*.workers.dev` | Claude Code + owner (phone check) | 1–2 h |
| **29 Oct, 03:00 UTC (08:30 IST)**, or the next morning that passes Phase 3 | 4: switch nameservers | Owner + Claude | 1 h active, plus up to a few hours of waiting |
| until ~13 Nov | 5: watch | Claude Code, 5 min a day | |
| after ~13 Nov | 6: cleanup | Claude Code | 45 min |

**Deadline rule:** while Vercel is paused, no visitors are lost by switching, so switch as soon as Phase 3 passes. If Phase 3 hasn't passed by **31 Oct**, stop. Vercel comes back on 1 Nov, and we switch calmly on **Tue 10 Nov at 03:00 UTC** (after the US midterms, as first planned). Don't rush a switch with failing checks: before 1 Nov there is nothing to roll back to.

---

## Phase 0: today, before the pause (27 Oct, before 22:45 UTC)

0.1 **[Claude Code] Export the Vercel Web Analytics history** (Cloudflare starts from zero). Use the Vercel MCP `aggregate_pageviews` (omit `teamId`), project `prj_434SjC1pNqZq862WlnL82nxIOpIh`, 6 Oct → now:
   - by `day`; by `requestPath` (limit 100); by `country` (limit 100); by `referrerHostname` (limit 100)
   - save as JSON to `../GSC/vercel-analytics-2026-10.json` (next to the GSC data, not in the repo).
   - Done when: the file exists and the daily totals add up to about 8,600 page views.

0.2 **[Owner] Namecheap: write down every DNS record and email forward.** Namecheap → Domain List → protesttracker.online → Manage:
   - *Advanced DNS*: screenshot every record. Expected: `A @ 216.198.79.1`, `www` → Vercel, `TXT google-site-verification=...`, eforward MX + SPF TXT. Copy the **full** `google-site-verification` value into a note.
   - *Redirect Email* (email forwarding): note every `alias → destination` pair. Email Routing has to recreate them.

0.3 **[Owner] Vercel → protest → Settings → Environment Variables:** note the names only (`GITHUB_DISPATCH_TOKEN`, `CRON_SECRET`, `READER_SALT`, `BLOB_READ_WRITE_TOKEN`). Values marked sensitive can't be read back. That's fine: Phase 1 creates new ones.

0.4 **[Owner] Create the Cloudflare account** (free) with the same email, and turn on two-factor login.

0.5 **[Owner] Bing Webmaster Tools:** check how protesttracker.online is verified (an earlier session found no Bing record or file). If it uses a DNS record or XML file, note it. If it was verified through Google Search Console, nothing is needed.

0.6 **[Claude Code] Let one more pipeline run finish before the pause** (check via the REST API, see memory `github-actions-access`). It clears any reader report older than 60 min from the Vercel inbox. Anything newer waits in Vercel Blob until 1 Nov (step 5.4).

### Phase 0 results (27 Oct 2026, 12:00–13:00 UTC)

- **Public DNS today** (read from 1.1.1.1; the Namecheap screenshot is still needed for anything hidden):
  - `A @ 216.198.79.1`
  - `CNAME www → 12a9e46515a96a94.vercel-dns-017.com`
  - `TXT @ google-site-verification=6P-5u53SyrySAJlTMct3b86Gf_hNDJ9vvSt2Vh4rJWE` (**Search Console is a Domain property, `sc-domain:protesttracker.online`, verified by this record: it must be copied exactly**)
  - `TXT @ v=spf1 include:spf.efwd.registrar-servers.com ~all`
  - `MX @ 10 eforward1/2/3, 15 eforward4, 20 eforward5 .registrar-servers.com`
  - TTL about 30 min; no CAA, no DMARC; nameservers `dns1/dns2.registrar-servers.com`
- **Bing:** no `msvalidate` meta tag, no `/BingSiteAuth.xml`, no Bing DNS record. It's probably imported from Search Console, which survives because the Google TXT record stays. The owner confirms in Bing Webmaster.
- **Vercel env vars:** `GITHUB_DISPATCH_TOKEN`, `CRON_SECRET`, `READER_SALT`, `BLOB_READ_WRITE_TOKEN`, `SITE_URL=https://protesttracker.online`. The Cloudflare build sets `SITE_URL` too, for parity.
- **Cloudflare account** already exists, with workers subdomain `swapnil-8723.workers.dev`. The trial address will be `https://protesttracker.swapnil-8723.workers.dev`.
- **Baseline of the live site** (Vercel, 27 Oct): `../GSC/cloudflare-baseline/vercel-2026-10-27/urls.json` plus raw sitemaps. 1,518 sitemap pages → all 200; 386 expanded redirects → all **308** to the right place; `/today/`, `/today.html`, `/hi/`, `/index.html` → 308; unknown pages → 404; `/api/report` GET → 405; `/api/inbox` → 401. **Cloudflare must match this file**, and Phase 3 compares it line by line.
- **Analytics history:** `../GSC/cloudflare-baseline/vercel-analytics-2026-10.json`. Search traffic over 6–27 Oct: Google 1,295 visitors, DuckDuckGo 771, Bing 499, Ecosia 127, Yahoo about 150.
- **Google Search baseline** (28 days): 1,203 clicks, 14,576 impressions, average position 8.1. Stored in `../GSC/gsc.sqlite`.
- **Pipeline:** last run at 12:20 UTC succeeded; scheduled runs at 15:17, 18:17 and 21:17 UTC still come before the pause.

---

## Phase 1: Cloudflare setup, no DNS change (about 30 min)

1.1 **[Owner, in Claude Code]** `! npx wrangler login` opens the browser and asks you to allow access.

1.2 **[Claude Code] Add `wrangler` as a devDependency** at a pinned exact version, the newest at least 2 weeks old (`npm i -D wrangler@<x.y.z>`). Check that `npm run build` still passes locally.

1.3 **[Claude Code] Create the D1 database:**
   ```
   npx wrangler d1 create loud-reader-inbox
   ```
   Put the returned `database_id` into `wrangler.jsonc` (step 2.1).

1.4 **[Owner] Web Analytics token:** Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site → hostname `protesttracker.online` → choose the **manual JS snippet** → copy the `token` from `data-cf-beacon`. This value is public (it ends up in every page), so it's fine to paste in chat.

1.5 **[Owner] New GitHub token for the cron backup:** GitHub → Settings → Developer settings → Fine-grained tokens → New. Repository access: only `swapnil8723-rgb/protest`. Permissions: **Actions: Read and write**. Expiry: 1 year (put a reminder in the calendar). Don't paste it in chat; step 2.12 stores it with `!`.

### Phase 1 results (27 Oct 2026)

- Wrangler was already logged in (OAuth, account `d332d133d913532f4c8c2c626521ca27`, swapnil.8723@gmail.com).
- `wrangler@4.150.0` added as an exact devDependency (released 13 Oct). Not committed yet. npm held back the `workerd` postinstall script (allowScripts). `wrangler deploy` doesn't need it; if `wrangler dev` complains in 2.11, approve it with `npm approve-scripts workerd`.
- **D1 `loud-reader-inbox`**, id `a9f615e1-d44f-4be2-a9dc-d69919947785`, region **ENAM** (between the US pipeline and the US/EU readers). The first attempt landed in APAC; it was empty and deleted.
- **The account is shared with other projects:** 10 Workers, 9 zones, 5 other D1 databases.
  - **Cron triggers: all 5 free slots are taken** (`aqi` 1, `downscribe-api` 1, `sunup-api` 2, `vault-api` 1), so the plan's Cloudflare cron for tick **can't be added**. Owner decision needed (see "Tick backup" below).
  - Workers Builds' 3,000 min a month and the 100k Worker requests a day are shared by the whole account. protesttracker's use: about 1,300 build min a month and well under 1k requests a day. Check the other projects' build use in Phase 5.
- Email: **owner uses no `@protesttracker.online` address** → skip Email Routing (step 4.8). The eforward MX/SPF records are dropped at the switch.
- Bing: verification method not confirmed yet (owner to check in Bing Webmaster).

### Tick backup: options (owner chooses)

1. **External free scheduler, recommended:** cron-job.org (free) calls `https://protesttracker.online/api/tick` every hour with `Authorization: Bearer <CRON_SECRET>`. This is exactly how Vercel Cron worked (an HTTP call with that header), so `worker/tick.ts` keeps the same `GET /api/tick` + `CRON_SECRET` check as `api/tick.ts`. It adds 24 Worker requests a day.
2. Free a slot in another project (e.g. merge `sunup-api`'s 2 crons into one). This touches another site, so it's not recommended.
3. No backup: rely only on GitHub's schedule, which has caused gaps and the "checks paused" banner before (25 Oct).

**Owner decisions (27 Oct, evening):** tick backup → **option 2**: free a cron slot in another project ("this site is the most important"). Web Analytics → the **automatic** zone setting after the switch (no snippet, no token); check it counts on switch day. Bing is verified by import from Google Search Console. No `@protesttracker.online` email is used.

**Freed slot:** `sunup-api` (RiseScribe, `../Social Media/worker`) drops its `"30 20 * * *"` trigger. Its daily block now runs on the `0 * * * *` tick when the UTC hour is 20 (01:30 IST instead of 02:00 IST; the ops digest still goes only on IST days 1 and 16). The deployed version matched git HEAD `47d214d` (both 11 Oct 05:45 UTC). The change is local, type-checked by `wrangler deploy --dry-run`, and **not deployed**. It must be deployed (with owner OK) **before** the first protesttracker deploy, or that deploy fails with "too many cron triggers".

---

## Phase 2: code (Claude Code, 1.5–2 h)

Rules for this phase: don't change `api/*.ts` or `vercel.json`, and leave `pipeline/` alone except for 2.9. Run `npm test` and `npm run build` before every commit. Get the owner's OK before pushing to `main`. Every push also triggers a Vercel build: before the pause it must still pass, and after it Vercel won't build.

2.1 **`wrangler.jsonc`** (new):
   ```jsonc
   {
     "name": "protesttracker",
     "main": "worker/index.ts",
     "compatibility_date": "2026-10-01",
     "compatibility_flags": ["nodejs_compat"],
     "assets": {
       "directory": "./dist",
       "binding": "ASSETS",
       "html_handling": "drop-trailing-slash",
       "not_found_handling": "404-page",
       "run_worker_first": ["/api/*"]
     },
     "d1_databases": [{ "binding": "INBOX", "database_name": "loud-reader-inbox", "database_id": "<from 1.3>", "migrations_dir": "migrations" }],
     "triggers": { "crons": ["50 * * * *"] },
     "vars": { "READER_REPO": "swapnil8723-rgb/protest" },
     "workers_dev": true,
     "preview_urls": false,
     "observability": { "enabled": true }
     // "routes" are added in step 4.6, not before
   }
   ```

2.2 **`migrations/0001_reports.sql`**:
   ```sql
   CREATE TABLE reports (
     id   TEXT PRIMARY KEY,   -- 'queue/<day>/<iphash>-<n>.json', the same id format the pipeline already gets
     day  TEXT NOT NULL,
     who  TEXT NOT NULL,      -- sha256(ip|day|salt), first 8 bytes in hex, as today
     n    INTEGER NOT NULL,
     at   TEXT NOT NULL,      -- ISO time; reader.ts sorts by it and reads submittedAt from data
     data TEXT NOT NULL       -- the cleaned report JSON incl. submittedAt
   );
   CREATE INDEX reports_who ON reports (day, who);
   ```
   Apply with `npx wrangler d1 migrations apply loud-reader-inbox --remote` (and `--local` for `wrangler dev`).

2.3 **`worker/report.ts`**: a port of `api/report.ts`:
   - The same `validate()` with the same messages and `code` values (the `/add` page shows `add.err.<code>`).
   - **Copy as-is (owner, 27 Oct):** keep the same 11-country list as `api/report.ts`. Don't fix anything during the move. (Known issue for later: the `/add` dropdown shows 60 countries but the backend accepts 11.)
   - IP from `cf-connecting-ip`, falling back to `x-forwarded-for`.
   - Count today's reports for `(day, who)` → if 3 or more, return 429 `limit`; otherwise `INSERT` with `n = count + 1`. Because `id` is the primary key, two reports at the same moment can't both take slot n. If the insert fails, try the next `n` once, then return 503 `busy`.
   - `GET` → 405, as today.

2.4 **`worker/inbox.ts`**: a port of `api/inbox.ts`:
   - The same `verifyGithubToken()` (issuer, `repository`, audience `loud-pipeline`, exp/nbf, a JWKS refresh when the key id is unknown). Use `atob`-based base64url so it doesn't rely on `Buffer`.
   - `GET` → `SELECT id, at, data FROM reports ORDER BY at LIMIT 200` → `{ items: [{ id, at, data: JSON.parse(data) }] }`. If `JSON.parse` fails, return `data: null, error`, like today.
   - `DELETE` → body `{ pathnames }`: keep only strings starting `queue/`, at most 200 → `DELETE ... WHERE id IN (...)` → `{ deleted: n }`.
   - `cache-control: no-store` on every response.

2.5 **`worker/tick.ts`**: a port of `api/tick.ts` without the HTTP route or `CRON_SECRET`: list the latest run; if none started in 165 min, `POST /dispatches`. Log the result (`console.log`) so it shows in Workers logs.

2.6 **`worker/index.ts`**:
   - `fetch`: route `/api/report`, `/api/inbox`; any other `/api/*` → JSON 404; everything else → `env.ASSETS.fetch(request)` (a safety net; normally assets never reach the script).
   - `scheduled`: `ctx.waitUntil(tick(env))`.
   - No `cloudflare:*` imports, so the code also runs under `node --test`.

2.7 **`scripts/postbuild.ts`**: generate `dist/_redirects` from `vercel.json`:
   - Skip rules with `has` (the `protesttracker.vercel.app` host rule only matters on Vercel).
   - Expand `:lang(hi|mr|es|fr|de)` into 5 static lines and `:cc(in|us|gb|pk|bd|np|ke|id)/:region/:city` into 8 dynamic lines (`/in/:region/:city /city/in/:region/:city 308`).
   - **Every line ends in `308`.**
   - **Stop the build** if a source still contains `(`, `)`, `?` or regex text after expansion, if there are more than 2,000 static or 100 dynamic rules, or if a line is over 1,000 characters. A silent bad redirect is worse than a failed build.
   - Add `Strict-Transport-Security: max-age=63072000` to `/*` in `_headers`.
   - Print `postbuild: N static + M dynamic redirects`.

2.8 **`src/layouts/Base.astro`**: analytics by host:
   - `process.env.VERCEL === '1'` → keep `<Analytics />` (the Vercel rollback stays identical).
   - else if `process.env.CF_BEACON_TOKEN` → `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token })}></script>`.
   - else (local builds) → nothing.

2.9 **Pipeline, the only change (optional but recommended for testing):**
   - `pipeline/reader.ts` `httpInbox()`: `const url = process.env.READER_INBOX_URL || \`${site}/api/inbox\``.
   - `.github/workflows/pipeline.yml`: add a `workflow_dispatch` input `inbox_url` (default empty) and pass `READER_INBOX_URL: ${{ inputs.inbox_url }}` in the Pipeline step's `env`. Scheduled runs leave it empty, so nothing changes for them.

2.10 **Tests** (`npm test`):
   - `tests/redirects.test.ts`: every `vercel.json` rule (except `has` rules) produces at least 1 line; the lang rules give exactly 5; every line ends `308`; there are no leftover `(`; counts are within limits.
   - `tests/reader.test.ts`: run the existing `validate` / `verifyGithubToken` cases against **both** `api/` and `worker/`, and check that both accept exactly the same countries.
   - `tests/worker.test.ts`: the worker `fetch` with an in-memory fake D1: 3 POSTs → 200, the 4th → 429; inbox without a token → 401; with a stubbed verifier → list → delete → empty; `GET /api/report` → 405; `/api/xyz` → 404.

2.11 **Local check:** `npm run build` → `npx wrangler dev` (local D1) → run `scripts/check-host.ts http://localhost:8787` (step 3.1) and fix anything red.

2.12 **Push, then connect Workers Builds:**
   - [Claude Code] commit (message says what moved) → **owner OK** → push to `main`.
   - [Owner] Cloudflare → Workers & Pages → Create → **Import a repository** → GitHub → allow access to `swapnil8723-rgb/protest` only → project name `protesttracker` → build command `npm run build` → deploy command `npx wrangler deploy` → root `/` → production branch `main` → builds for other branches **off**.
   - [Owner] build variables: `NODE_VERSION = 24` (the build scripts need Node 22.18 or later), `CF_BEACON_TOKEN = <from 1.4>`.
   - Start the first build. Done when it's green and `https://protesttracker.<account>.workers.dev` shows the home page.
   - [Owner, in Claude Code] secrets, typed with `!` so they never enter the chat:
     ```
     ! npx wrangler secret put GITHUB_DISPATCH_TOKEN
     ! npx wrangler secret put READER_SALT
     ```
     (For the salt, paste any long random text, e.g. from `node -e "console.log(crypto.randomUUID())"`.)
   - [Claude Code] `npx wrangler d1 migrations apply loud-reader-inbox --remote`.

### Phase 2 results (27 Oct 2026)

- Written: `wrangler.jsonc`, `worker/{index,report,inbox,tick,types}.ts`, `migrations/0001_reports.sql`, `scripts/redirects.ts`, `scripts/check-host.ts`, `tests/worker.test.ts`. Changed: `scripts/postbuild.ts` (writes `_redirects`, adds HSTS), `src/layouts/Base.astro` (`<Analytics />` only when `process.env.VERCEL`), `pipeline/reader.ts` + `pipeline.yml` (optional `READER_INBOX_URL` / `inbox_url` input), `tests/reader.test.ts` (same cases on both copies). `api/*.ts` and `vercel.json` are unchanged.
- `npm test`: **38/38 pass**. `npm run build`: 1,623 pages, 2,120 files; **9 min on this PC** (Vercel: 2.3 min). Measure on Workers Builds; account minutes are shared.
- **Bug caught by local testing:** Cloudflare counts every `_redirects` line after the first pattern as a pattern (max 100) and **silently skips the rest**. With `vercel.json`'s order (city patterns 2nd), 287 old links would have returned 404. Fix: fixed lines first, patterns last. A test now enforces the order.
- **307 → 308:** Cloudflare's `html_handling` answers `/today/` and `/today.html` with 307 (temporary); Vercel uses 308. Added `/index.html / 308`, `/*/ /:splat 308` and `/*.html /:splat 308`, so they're identical now (query strings kept). Final `_redirects`: 379 fixed + 10 patterns.
- **`wrangler dev` vs the Vercel baseline: PASS on all 1,922 URLs** (sitemap pages, 386 redirects, 404s, API status codes, cache headers, canonicals, noindex). The form gave 200 → 429 at the 4th report. Local test reports deleted.

---

## Phase 3: test on `*.workers.dev` (1–2 h)

3.1 **[Claude Code] `scripts/check-host.ts <base>`** (new, kept for Phase 5). It checks:
   - **Every URL in the built sitemaps** (`dist/sitemap-*.xml`, `dist/news-sitemap.xml`) → 200, `text/html`, and the page's canonical is `https://protesttracker.online/...`.
   - **Every redirect** from `vercel.json` (expanded) → 308, and `Location` matches the destination.
   - `/today/` and `/today.html` → redirect to `/today` (note the status: Vercel uses 308); `/hi/` → `/hi`; `/no-such-page` → **404** with the LOUD 404 page.
   - Files: `/robots.txt`, `/llms.txt`, `/feed.xml`, `/sitemap-index.xml`, `/news-sitemap.xml`, `/site.webmanifest`, `/<INDEXNOW_KEY>.txt`, `/maps/in.svg`, `/geo/globe.topo.json`, one `/cards/*.png`, one `/fonts/*.woff2`, one `/_astro/*` → 200, the right content type, and the cache headers from `_headers`.
   - `/_redirects` and `/_headers` → 404 (not published as files).
   - API: `GET /api/report` → 405; a bad POST → 400 with the right `code`; 3 good POSTs → 200 and the 4th → 429; `/api/inbox` with no token → 401 (both GET and DELETE).
   - It prints one line per failure and a final `PASS` / `FAIL n`.

3.2 **[Claude Code] Remove the test reports straight away**, before any pipeline run can see them. Test reports use a title containing `TEST-MIGRATION`:
   ```
   npx wrangler d1 execute loud-reader-inbox --remote --command "DELETE FROM reports WHERE data LIKE '%TEST-MIGRATION%'"
   ```
   Then check: `SELECT COUNT(*) FROM reports` → 0.

3.3 **[Owner or Claude Code] Real pipeline against the new inbox:** Actions → pipeline → Run workflow → `inbox_url = https://protesttracker.<account>.workers.dev/api/inbox`. Done when the log shows `reader: 0 published, 0 held, ...` (**not** `inbox unavailable`) and the run commits as usual. That proves the GitHub OIDC check works on Cloudflare.

3.4 **[Claude Code] Cron:** after the next :50, check the Worker logs (dashboard → Worker → Logs, or `npx wrangler tail`) for `skipped: recent run` or `dispatched: true`.

3.5 **[Owner] Phone check (5 min):** open the workers.dev address on your phone: home, a country page, an event page, a Serious Mode event, `/hi`, `/de/today`, `/add`. The map, fonts and share card should look the same as on Vercel.

3.6 **[Claude Code] Analytics:** a visit to workers.dev shows up in Cloudflare Web Analytics within a few minutes.

### Go / no-go for Phase 4 (all must be yes)

- [ ] `check-host.ts` → PASS on workers.dev
- [ ] 3.3 pipeline run logged the reader line without "unavailable", and committed
- [ ] Workers Builds: the last 2 builds are green, including one triggered by a pipeline `data:` commit
- [ ] the phone check looks right
- [ ] D1 has 0 test rows
- [ ] the owner has the Phase 0 DNS and email notes to hand

---

## Phase 4: the switch (about 1 h active)

Start at **03:00 UTC (08:30 IST)**. Claude Code watches each step.

4.1 **[Owner] Add the domain to Cloudflare:** dashboard → Add a domain → `protesttracker.online` → **Free** → let it scan the DNS. Check the list against the Phase 0 notes:
   - **Keep** `TXT google-site-verification=...` exactly (compare character by character), plus any Bing record from 0.5.
   - Keep `A @ 216.198.79.1` and `www` for now, but set them to **DNS only (grey cloud)**. They're replaced in 4.6.
   - **Delete** the eforward MX and SPF records (Email Routing adds its own in 4.8).

4.2 **[Owner] Zone settings, before the nameservers move:**
   - SSL/TLS → Edge Certificates → **Always Use HTTPS: on**.
   - Security → Bots → **Bot Fight Mode: off** (it can challenge Bing, DuckDuckGo and other crawlers).
   - AI Crawl Control / "Block AI bots": **do not block**; **Managed robots.txt: off** (the site serves its own `robots.txt` and `llms.txt`).
   - Scrape Shield → **Email Address Obfuscation: off** (it rewrites the contact email in the HTML).
   - Speed → **Rocket Loader: off**.
   - Leave everything else at the defaults.

4.3 **[Owner] Namecheap → protesttracker.online → Manage → Nameservers → Custom DNS** → enter the 2 Cloudflare nameservers shown in 4.1 → save. (DNSSEC is already off, so there's nothing to remove.)

4.4 **[Claude Code] Wait for "Active":** run `nslookup -type=NS protesttracker.online 1.1.1.1` every 10 min until it shows the Cloudflare nameservers. Cloudflare also emails when the zone is active. Usually minutes to 2 h, at most 24 h. Until then some visitors still reach Vercel, which is paused, so nothing changes for them.

4.5 **[Owner] When active:** in Cloudflare DNS, **delete** `A @` and the `www` record.

4.6 **[Claude Code] Attach the domain to the Worker:** add to `wrangler.jsonc`
   ```jsonc
   "routes": [{ "pattern": "protesttracker.online", "custom_domain": true }]
   ```
   → commit → owner OK → push → Workers Builds deploys, and Cloudflare creates the apex record and certificate (a few minutes).

4.7 **[Owner] www → apex:** DNS → add `AAAA www 100::` **proxied (orange)** → Rules → Redirect Rules → template "Redirect from WWW to root" → **308**, keep the query string.

4.8 **[Owner] Email Routing:** Email → Email Routing → enable (it adds MX/SPF) → recreate every alias from 0.2 → confirm the destination address from the email Cloudflare sends.

4.9 **[Claude Code] Check the real domain:** `check-host.ts https://protesttracker.online`, plus `https://www.protesttracker.online/today` → 308 to `https://protesttracker.online/today`. Everything must be PASS. If not, fix forward (before 1 Nov Vercel can't take the traffic back).

4.10 **[Claude Code] One pipeline run on the real domain** (workflow_dispatch with `inbox_url` empty). Check: the reader line, the data commit, a green Workers build and `indexnow: N urls → HTTP 200/202`.

4.11 **[Claude Code] Stop Vercel rebuilding protest** (so deployment storage stops growing): in `vercel.json` set `"ignoreCommand": "exit 0"` (exit 0 = skip). Keep the domains attached in the Vercel project for rollback. On or after 1 Nov, delete old protest deployments in Vercel, keeping the latest, to bring deployment storage back under 10 GB for the other 5 projects.

4.12 **[Owner] Search engines:** Google Search Console → Sitemaps → resubmit `sitemap-index.xml` and `news-sitemap.xml`; URL Inspection → Request indexing for `/` and one busy country page. Bing Webmaster → resubmit the same sitemaps. The domain doesn't change, so there's **no** change-of-address to file.

---

## Phase 5: watch for 2 weeks (Claude Code, about 5 min a day)

5.1 Daily: Workers Builds all green; a pipeline run every ≤3 h; no "checks paused" banner on `/`; `check-host.ts https://protesttracker.online` PASS.
5.2 Cloudflare: Worker requests per day well under 100k (only `/api/*`); Security → Events shows **no challenges** to Googlebot, Bingbot or DuckDuckBot.
5.3 Google Search Console: Pages → "Not found (404)", "Redirect error" and "Server error (5xx)" don't jump; crawl stats keep going.
5.4 On 1 Nov (Vercel unpaused): if any reader reports stayed in Vercel Blob (step 0.6), copy them once into D1 with the same ids (a one-off local script with a Vercel Blob token), then empty the Blob store.
5.5 **Rollback triggers** (any one): the site is down for more than 30 min and can't be fixed forward; Google 5xx/404 errors jump; the pipeline can't publish for more than 6 h because of the move.

### Rollback (only works once Vercel is unpaused, from 1 Nov)

1. Cloudflare DNS: remove the Worker custom domain; add `A @ 216.198.79.1` and the old `www` record from the Phase 0 screenshot, both **DNS only**. (The nameservers stay on Cloudflare, so this takes effect in minutes; there's no Namecheap change.)
2. `vercel.json`: restore `ignoreCommand` to `git log -1 --pretty=%s | grep -qF '[skip vercel]'` → push → Vercel builds the latest data.
3. Email Routing keeps working; nothing to undo.
4. About 15–30 minutes in total. The usage limits make this a short-term fix only.

---

## Phase 6: cleanup (after ~13 Nov, Claude Code, about 45 min, with owner OK)

6.1 Move the redirect list out of `vercel.json` into `redirects.json`; update `scripts/merge-events.ts`, `scripts/withdraw-events.ts` and `postbuild.ts`; keep the redirect test.
6.2 Delete `api/`, `vercel.json`, `@vercel/analytics`, `@vercel/blob` and the Vercel branch in `Base.astro`; point `tests/reader.test.ts` only at `worker/`.
6.3 Workflow: remove the `[skip vercel]` wording and comments about Vercel and Hobby; keep `should-deploy.ts` (it still decides IndexNow pings).
6.4 `wrangler.jsonc`: `"workers_dev": false` (so there's no duplicate copy of the site on workers.dev).
6.5 Update CLAUDE.md (Architecture → Deploy, Schedule and Reader reports lines), PLAN.md §0 and memory.
6.6 Vercel: delete the protest project's domains, then the project.

---

## Risks

| Risk | How the plan handles it |
|---|---|
| Pipeline stops publishing | Pipeline code is unchanged except one optional setting; the inbox failing doesn't stop a run (checked); 3.3 and 4.10 test it for real |
| Redirect sent as 302 (temporary), or a `:lang` rule copied unexpanded | `postbuild.ts` writes 308 on every line and stops the build on leftovers; `check-host.ts` tests every rule |
| A sitemap URL disappears | `check-host.ts` requests every sitemap URL |
| Search Console loses verification | TXT copied exactly in 4.1 and checked character by character |
| Crawlers challenged | Bot Fight Mode off, AI blocking off, Security Events checked in 5.2 |
| Email forwarding gap | Email Routing set up straight after activation (4.8); a gap of an hour or two is expected |
| Workers Builds runs out of minutes | ~1,300 of 3,000 min expected; if builds get slow, add `[skip vercel]`-style skipping through a deploy hook later |
| Switch fails before 1 Nov | Strict go/no-go; fix forward; deadline rule (stop on 31 Oct and wait for 10 Nov) |
| Duplicate content on workers.dev | Not linked anywhere; turned off in 6.4 |
| GitHub dispatch token expires in a year | Calendar reminder (1.5) |

## Questions for the owner before Phase 1

1. Which email addresses forward through Namecheap today (0.2)?
2. How is Bing Webmaster verified (0.5)?
3. ~~11-country fix~~: decided 27 Oct, copy everything as-is, no fixes during the move.
