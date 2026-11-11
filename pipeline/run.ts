// The pipeline (every 4 hours): discover → fetch → summaries already due → classify → dedupe →
// new summaries → reader reports → score → translate → review → save.
// usage: node pipeline/run.ts                 (normal run, GitHub Actions)
//        node pipeline/run.ts --backfill=5   (launch: last 5 days of GDELT daily files)
//        node pipeline/run.ts --no-discover  (re-process what is already stored)
import { SITE } from '../src/site.ts';
import { makeAi, OverBudget } from './ai.ts';
import { fetchPage, type Page } from './article.ts';
import { byIso, LIMITS, TRANSLATE_TO } from './config.ts';
import { classify } from './classify.ts';
import { dedupe } from './dedupe.ts';
import { corroborate } from './corroborate.ts';
import { discoverDays, discoverRecent, type GdeltHit } from './gdelt.ts';
import { discoverRss, type RssItem } from './rss.ts';
import { score } from './score.ts';
import { sweep, titleKey } from './sweep.ts';
import { loadArticles, loadEvents, loadState, saveArticles, saveEvents, saveState, writeChanged } from './store.ts';
import { reserveSlugs, summarize, visible } from './summarize.ts';
import { fileInbox, httpInbox, processReaderReports, scoreReaders } from './reader.ts';
import { pollDecisions, reviewerConfigured, sendReviews } from './telegram.ts';
import { translate } from './translate.ts';
import { reportedAt } from './events.ts';
import type { Article, ProtestEvent, RunLog } from './types.ts';
import { hostOf, looksLikeProtest, nowIso, pool, publisherOf } from './util.ts';

// undici can throw an internal assertion from a socket callback when a server ends a
// response mid-parse (seen on a few news sites). It is isolated to that request; the
// fetch itself rejects via its timeout, so keep the run alive instead of crashing.
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'ERR_ASSERTION' && String(err.stack).includes('undici')) return console.warn('undici assertion ignored');
  console.error(err);
  process.exit(1);
});

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const t0 = Date.now();
const notes: string[] = [];
const log = (s: string) => {
  notes.push(s);
  console.log(s);
};

/** Drop tracking params and fragments so the same story isn't stored twice. */
export function cleanUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|cmp|from$|ito$)/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return u;
  }
}

const state = loadState();
const articles = loadArticles();
const events = loadEvents();
reserveSlugs(events.values());
const ai = makeAi(state);
const snap = (e: ProtestEvent) => JSON.stringify([visible(e), e.published, e.vibe, e.isOngoing, e.i18n?.of]);
const before = new Map([...events.values()].map((e) => [e.id, snap(e)]));
const run: RunLog = { at: nowIso(), ms: 0, discovered: 0, fetched: 0, classified: 0, protests: 0, summarized: 0, published: 0, live: 0, aiCalls: 0, notes };
const summarized: string[] = [];
const summarizedIds = new Set<string>();
const pages = new Map<string, Page>();
// Seconds each step took, logged once per run (to see where the Actions minutes go).
const laps: string[] = [];
let lastLap = Date.now();
const lap = (step: string) => {
  laps.push(`${step} ${Math.round((Date.now() - lastLap) / 1000)}s`);
  lastLap = Date.now();
};
log(`run: AI provider ${ai.name}, reviewer ${reviewerConfigured() ? 'telegram' : 'none (strict auto-publish)'}`);

try {
  // 1. Human decisions first, so an Approve tapped 10 minutes ago publishes now.
  try {
    await pollDecisions(state, events, log);
  } catch (e) {
    log(`telegram poll: ${(e as Error).message}`);
  }

  // 2. Discover
  if (args['no-discover'] !== 'true') {
    let hits: GdeltHit[] = [];
    if (args.backfill) {
      const days = Array.from({ length: Number(args.backfill) }, (_, i) => new Date(Date.now() - (i + 1) * 864e5).toISOString().slice(0, 10)).reverse();
      hits = await discoverDays(days, log);
      // Today so far is not in a daily file yet: walk today's 15-minute files from 00:00 UTC.
      const midnight = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - 15 * 60e3;
      const r = await discoverRecent(new Date(midnight).toISOString().replace(/[-:T]/g, '').slice(0, 14), log);
      hits.push(...r.hits);
      state.gdeltCursor = r.cursor;
    } else {
      const r = await discoverRecent(state.gdeltCursor, log);
      hits = r.hits;
      state.gdeltCursor = r.cursor;
      log(`gdelt: ${r.files} files, ${hits.length} protest URLs`);
    }
    const rss: RssItem[] = await discoverRss(log, args.backfill ? 24 * Number(args.backfill) : 72);
    log(`rss: ${rss.length} protest-word items`);
    const now = nowIso();
    for (const h of hits) {
      const url = cleanUrl(h.url);
      const a = articles.get(url);
      if (a) {
        a.gdelt ??= { codes: [], fips: h.fips, place: h.place, articles: 0 };
        for (const c of h.codes) if (!a.gdelt.codes.includes(c)) a.gdelt.codes.push(c);
        a.gdelt.articles = Math.max(a.gdelt.articles, h.articles);
        continue;
      }
      articles.set(url, {
        url, publisher: hostOf(url), via: 'gdelt', firstSeenAt: h.added < now ? h.added : now, fetch: 'new',
        gdelt: { codes: h.codes, fips: h.fips, place: h.place, articles: h.articles },
      });
      run.discovered++;
    }
    for (const r of rss) {
      const url = cleanUrl(r.url);
      if (articles.has(url)) continue;
      const seen = r.publishedAt && r.publishedAt < now ? r.publishedAt : now;
      articles.set(url, { url, publisher: hostOf(url), via: 'rss', firstSeenAt: seen, title: r.title, description: r.description, publishedAt: r.publishedAt, fetch: 'new' });
      run.discovered++;
    }
    // Second-newsroom search for fresh single-source stories (never fatal to the run).
    if (!args.backfill) {
      const pubs = new Map<string, Set<string>>();
      const originals = new Map<string, Article>(); // newest held article per story, for a search in its own language
      for (const a of articles.values()) {
        if (!a.eventId) continue;
        (pubs.get(a.eventId) ?? pubs.set(a.eventId, new Set()).get(a.eventId)!).add(publisherOf(a.url));
        const o = originals.get(a.eventId);
        if (a.title && a.fetch === 'ok' && (!o || reportedAt(a) > reportedAt(o))) originals.set(a.eventId, a);
      }
      try {
        const leads = await corroborate(events.values(), (id) => pubs.get(id) ?? new Set(), (id) => { const a = originals.get(id); return a?.title ? { title: a.title, lang: a.lang } : undefined; }, log, { max: LIMITS.searchPerRun, perEvent: LIMITS.searchPerEvent, budgetMs: LIMITS.searchSeconds * 1000 });
        for (const l of leads) {
          const url = cleanUrl(l.url);
          if (articles.has(url)) continue;
          articles.set(url, { url, publisher: hostOf(url), via: 'search', firstSeenAt: nowIso(), title: l.title, publishedAt: l.publishedAt, fetch: 'new' });
          run.discovered++;
        }
      } catch (e) {
        log(`search: ${(e as Error).message}`);
      }
      // Country-by-country search in the local language (never fatal to the run).
      try {
        const known = new Set<string>();
        for (const a of articles.values()) if (a.title) known.add(titleKey(a.title));
        state.swept ??= {};
        for (const l of await sweep(known, state.swept, log, { max: LIMITS.sweepPerRun, budgetMs: LIMITS.sweepSeconds * 1000 })) {
          const url = cleanUrl(l.url);
          if (articles.has(url)) continue;
          articles.set(url, { url, publisher: hostOf(url), via: 'search', firstSeenAt: nowIso(), title: l.title, publishedAt: l.publishedAt, fetch: 'new' });
          run.discovered++;
        }
      } catch (e) {
        log(`sweep: ${(e as Error).message}`);
      }
    }
  }

  // 3. Fetch new articles (newest first), cheap keyword gate before any AI.
  const fresh = [...articles.values()].filter((a) => a.fetch === 'new').sort((a, b) => (a.firstSeenAt < b.firstSeenAt ? 1 : -1));
  const cap = args.backfill ? 5000 : LIMITS.fetchPerRun;
  let n = 0;
  await pool(fresh.slice(0, cap), LIMITS.fetchConcurrency, async (a) => {
    if (++n % 100 === 0) console.log(`fetch: ${n}/${Math.min(cap, fresh.length)}`);
    try {
      const p = await fetchPage(a.url);
      a.title = p.title || a.title;
      a.description = p.description || a.description;
      a.publishedAt = p.publishedAt || a.publishedAt;
      a.lang = p.lang;
      a.fetch = 'ok';
      pages.set(a.url, p);
      run.fetched++;
      if (!looksLikeProtest(`${a.title} ${a.description} ${p.text.slice(0, 1500)}`)) {
        a.cls = { at: nowIso(), isProtest: false, reason: 'no protest vocabulary' };
      } else if (a.via !== 'owner' && a.publishedAt && Date.now() - Date.parse(a.publishedAt) > 12 * 864e5) {
        a.cls = { at: nowIso(), isProtest: false, reason: 'article older than 12 days' };
      }
    } catch (e) {
      a.fetch = 'failed';
      a.fetchError = (e as Error).message.slice(0, 120);
    }
  });
  log(`fetch: ${run.fetched} ok, ${fresh.slice(0, cap).filter((a) => a.fetch === 'failed').length} failed`);
  lap('discover+fetch');

  // 4a. Summaries that were already due (left over when an earlier run ran out of time or AI)
  // come before judging new articles: these are what publish, the new ones only become
  // candidates. On 9–10 Nov 2026 two runs spent their AI time classifying and published nothing.
  summarized.push(...(await summarize(ai, events, articles, log, { skip: summarizedIds, pages })));
  lap('summaries waiting');

  // 4. Classify (articles fetched in an earlier run but not yet judged are re-read).
  const todo = [...articles.values()].filter((a) => a.fetch === 'ok' && !a.cls).sort((a, b) => (a.firstSeenAt < b.firstSeenAt ? -1 : 1));
  await pool(todo.filter((a) => !pages.has(a.url)), LIMITS.fetchConcurrency, async (a) => {
    try {
      pages.set(a.url, await fetchPage(a.url));
    } catch {
      /* classify from title + description */
    }
  });
  const c = await classify(ai, todo, pages, events, log);
  run.classified = c.classified;
  run.protests = c.protests;
  lap('classify');

  // 4b. Fold duplicate events in one city together before their summaries are written.
  await dedupe(ai, events, articles, log);
  lap('dedupe');

  // 5. Summaries for events that reached ≥ 2 independent publishers in this run
  // (events summarised in 4a wait for the next run, so none costs two calls in one run).
  summarized.push(...(await summarize(ai, events, articles, log, { skip: summarizedIds, pages })));
  lap('new summaries');

  // 6. Reader reports from the "Add a protest" form, at least an hour old.
  const inbox = process.env.READER_INBOX_FILE ? fileInbox(process.env.READER_INBOX_FILE) : httpInbox(SITE);
  if (inbox && process.env.READER_REPORTS !== 'off') {
    try {
      const r = await processReaderReports(ai, events, inbox, log);
      log(`reader: ${r.published.length} published, ${r.held.length} held, ${r.merged.length} duplicates, ${r.rejected.length} rejected, ${r.waiting} waiting`);
    } catch (e) {
      if (e instanceof OverBudget) throw e;
      log(`reader: inbox unavailable: ${(e as Error).message}`);
    }
    lap('reader reports');
  }
} catch (e) {
  if (e instanceof OverBudget) log(`AI budget: ${e.message} — remaining work waits for a later run`);
  else throw e;
} finally {
  run.summarized = summarized.length;
  // 7. Score, review, save — always, so partial progress is kept.
  score(events, articles, { reviewer: reviewerConfigured() });
  scoreReaders(events);
  // 8. Translate cards whose English changed (after scoring, so first-time publishes get it now).
  try {
    run.translated = (await translate(ai, events, log)).length;
  } catch (e) {
    log(`translate: stopped: ${(e as Error).message}`);
  }
  lap('translate');
  log(`timing: ${laps.join(', ')}`);
  try {
    await sendReviews(events, SITE, log);
  } catch (e) {
    log(`telegram send: ${(e as Error).message}`);
  }
  const changed: string[] = [];
  for (const e of events.values()) {
    if (before.get(e.id) === snap(e)) continue;
    // Unconfirmed reader reports are noindex: list pages change, their own page is not pinged.
    if (e.published && e.slug && e.origin === 'reader' && e.stage !== 'live') changed.push('/today');
    else if (e.published && e.slug) {
      const cc = byIso.get(e.place.country)!;
      const paths = [`/p/${e.slug}`, `/country/${cc.slug}`, `/city/${cc.iso}/${e.place.regionSlug}/${e.place.citySlug}`];
      changed.push(...paths);
      for (const l of TRANSLATE_TO) if (e.i18n?.[l.code]) changed.push(...paths.map((p) => `/${l.code}${p}`));
    }
  }
  if (changed.length) changed.push('/', '/today');
  writeChanged(changed);
  saveEvents(events);
  saveArticles(articles, events);
  run.published = [...events.values()].filter((e) => e.published).length;
  run.live = [...events.values()].filter((e) => e.published && e.isOngoing).length;
  run.aiCalls = ai.calls;
  run.ms = Date.now() - t0;
  state.lastRunAt = run.at;
  state.runs.push({ ...run, notes: notes.slice(-40) });
  saveState(state);
  console.log(`done in ${(run.ms / 1000).toFixed(1)}s — discovered ${run.discovered}, fetched ${run.fetched}, classified ${run.classified}, protests ${run.protests}, summarized ${run.summarized}, published ${run.published} (${run.live} live), AI calls ${run.aiCalls}`);
}
