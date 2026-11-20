// Step: Big Stories, refreshed once a day (owner decision, 20 Nov 2026; before that they were
// written by hand only). Free by design: it runs inside one ordinary pipeline run a day, on the
// same free Gemini key, and adds about 3 Actions minutes and ~7 AI calls a day.
//
//   1. today's top headlines from Google News in the reader markets (US, UK, FR, DE, JP, ES, IT)
//   2. one AI call picks up to LIMITS.storiesPerDay stories: updates to stories already up, then new ones
//   3. per story: a news search (Bing News, then Google News), articles downloaded, one per independent newsroom
//   4. one AI call writes the page from those articles only
//   5. rules, not AI, decide whether it is published (`check`): ≥ 2 independent newsrooms on-story,
//      every side with sources, no tone words or copied sentences outside quotes, every big number
//      found in a source, no private people, not a protest. A story that fails keeps its last
//      checked version, which leaves the home page 10 days after that check (src/lib/stories.ts).
// Hand-written stories still work the same way; a daily update may rewrite them, keeping the slug.
import fs from 'node:fs';
import path from 'node:path';
import { OverBudget, Pending, type Ai } from './ai.ts';
import { fetchPage } from './article.ts';
import { LIMITS, RULES } from './config.ts';
import { Blocked, decode as gnewsUrl, get } from './corroborate.ts';
import { independentGroups } from './events.ts';
import {
  SYSTEM, storyPickPrompt, storyPickSchema, storyPrompt, storySchema,
  type HeadlineIn, type StoryOut, type StoryPickOut, type SummarySource,
} from './prompts.ts';
import { decode } from './rss.ts';
import { SERIOUS_WORDS } from './score.ts';
import { DATA_DIR } from './store.ts';
import type { Article, SourceRef, State } from './types.ts';
import { hoursSince, isBlockedUrl, MONTHS, nowIso, pool, publisherOf, slugify } from './util.ts';

/** The page file, as src/lib/stories.ts reads it. */
export interface StoryFile {
  slug: string;
  title: string;
  seoTitle?: string;
  topic: StoryOut['topic'];
  countries: string[];
  status: 'developing' | 'settled';
  serious?: boolean;
  startedOn: string;
  dek: string;
  happened: string;
  happenedSources: number[];
  sides: { who: string; says: string; sources: number[] }[];
  next: string;
  nextSources: number[];
  summary: string;
  sources: SourceRef[];
  conflicts: string[];
  verifiedAt: string;
  updatedAt: string;
  /** Written by this step, not by hand. */
  auto?: boolean;
}

const EDITIONS: [string, string][] = [
  ['US', 'hl=en-US&gl=US&ceid=US:en'],
  ['UK', 'hl=en-GB&gl=GB&ceid=GB:en'],
  ['FR', 'hl=fr&gl=FR&ceid=FR:fr'],
  ['DE', 'hl=de&gl=DE&ceid=DE:de'],
  ['JP', 'hl=ja&gl=JP&ceid=JP:ja'],
  ['ES', 'hl=es&gl=ES&ceid=ES:es'],
  ['IT', 'hl=it&gl=IT&ceid=IT:it'],
];
const TOPICS = new Set(['sport', 'politics', 'business', 'world']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Left out of country lists everywhere on the site (rule 5, see CLAUDE.md).
const NOT_COUNTRIES = new Set(['xk', 'tw']);
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

const dir = () => path.join(DATA_DIR, 'stories');
const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

export function loadStories(): Map<string, StoryFile> {
  const out = new Map<string, StoryFile>();
  if (!fs.existsSync(dir())) return out;
  for (const f of fs.readdirSync(dir())) {
    if (!f.endsWith('.json')) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')) as StoryFile;
      out.set(s.slug, s);
    } catch {
      /* a broken file is left for a human */
    }
  }
  return out;
}

/** Is today's refresh due? Once a UTC day, from LIMITS.storiesFromHourUtc (STORIES=off|force). */
export function storiesDue(state: State, now = new Date()): boolean {
  if (process.env.STORIES === 'off') return false;
  if (process.env.STORIES === 'force') return true;
  return state.storiesDay !== now.toISOString().slice(0, 10) && now.getUTCHours() >= LIMITS.storiesFromHourUtc;
}

// ── Rules (deterministic; the AI never decides what is published) ─────────────

/** Text outside double quotes: quotes may repeat a source's words and adjectives, nothing else may. */
export const unquoted = (s: string) => s.replace(/"[^"]*"|“[^”]*”|„[^“”]*[“”]|«[^»]*»/g, ' ');
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];

/** A run of 12 words that also appears in a source = a copied sentence (rule 6). */
export function copiedRun(text: string, sources: string[], n = 12): string | undefined {
  const grams = new Set<string>();
  for (const src of sources) {
    const w = words(src);
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(' '));
  }
  const w = words(unquoted(text));
  for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n).join(' ');
    if (grams.has(g)) return g;
  }
}

// "1,488", "1.488", "115.8", "146 000" → one run of digits, in the page and in the sources alike.
const digits = (s: string) => s.replace(/(\d)[,.'](?=\d)/g, '$1').replace(/(\d)[   ](?=\d{3}(?!\d))/g, '$1');
/** Numbers of 3+ digits (not years) that no source contains: "never publish a number without a source". */
export function unsourcedNumbers(text: string, sources: string[]): string[] {
  const pool = digits(sources.join(' '));
  return [...new Set(digits(unquoted(text)).match(/\d{3,}/g) ?? [])]
    .filter((n) => !(n.length === 4 && +n >= 1900 && +n <= 2100))
    .filter((n) => !new RegExp(`(^|\\D)${n}(\\D|$)`).test(pool));
}

export interface CheckInput {
  out: StoryOut;
  picked: Article[];
  texts: string[];
  existing?: StoryFile;
  taken: Set<string>;
  now?: string;
}

/** Validate the AI's page and build the file. Returns the reason when it must not be published. */
export function check({ out, picked, texts, existing, taken, now = nowIso() }: CheckInput): { story: StoryFile } | { reason: string } {
  if (!out || typeof out !== 'object') return { reason: 'no answer' };
  if (!out.is_news) return { reason: `not news: ${clip(out.not_reason, 80)}` };
  if (out.is_protest) return { reason: 'a protest (the protest pipeline covers it)' };
  if (out.names_private_people) return { reason: 'would name private people' };

  const kept = [...new Set((out.same_story_sources ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= picked.length))].sort((a, b) => a - b);
  const keptArts = kept.map((n) => picked[n - 1]);
  const groups = independentGroups(keptArts).length;
  if (groups < RULES.minPublishers) return { reason: `only ${groups} independent newsroom(s) on-story` };
  const renum = new Map(kept.map((old, i) => [old, i + 1]));
  const refs = (ns: unknown) => [...new Set((Array.isArray(ns) ? ns : []).map((n) => renum.get(Number(n))).filter((n): n is number => !!n))].sort((a, b) => a - b);

  const sides = (out.sides ?? [])
    .map((s) => ({ who: clip(s?.who, 80), says: clip(s?.says, 600), sources: refs(s?.sources) }))
    .filter((s) => s.who && s.says && s.sources.length)
    .slice(0, 5);
  if (sides.length < 2) return { reason: 'fewer than two sides with sources' };
  const happenedSources = refs(out.happened_sources);
  if (!happenedSources.length) return { reason: 'what happened has no sources' };

  const title = clip(out.title, 120);
  const dek = clip(out.dek, 320);
  const happened = clip(out.happened, 1800);
  const next = clip(out.next, 600);
  const summary = clip(out.summary, 900);
  const conflicts = (out.conflicts ?? []).map((c) => clip(c, 300)).filter(Boolean).slice(0, 4);
  if (!title || !dek || !happened || !summary) return { reason: 'empty text' };

  const prose = [title, dek, happened, next, summary, ...sides.map((s) => s.says), ...conflicts].join('\n');
  const tone = unquoted(prose).match(SERIOUS_WORDS);
  if (tone) return { reason: `tone word "${tone[0]}" outside a quote` };
  const keptTexts = kept.map((n) => texts[n - 1]);
  const copied = copiedRun(prose, keptTexts);
  if (copied) return { reason: `copies a source: "${copied}"` };
  const loose = unsourcedNumbers(prose, keptTexts);
  if (loose.length) return { reason: `numbers not in any source: ${loose.slice(0, 3).join(', ')}` };

  const countries = [...new Set((out.countries ?? []).map((c) => String(c).toLowerCase().trim()))]
    .filter((c) => /^[a-z]{2}$/.test(c) && !NOT_COUNTRIES.has(c) && regionName.of(c.toUpperCase()) !== c.toUpperCase())
    .slice(0, 6);
  if (!countries.length) return { reason: 'no valid country' };

  const today = now.slice(0, 10);
  const startedOn = existing?.startedOn ?? (DATE.test(out.started_on) && out.started_on <= today ? out.started_on : today);
  const sources: SourceRef[] = keptArts.map((a, i) => ({
    n: i + 1, url: a.url, publisher: publisherOf(a.url), title: clip(decode(a.title || ''), 200), publishedAt: a.publishedAt,
  }));
  const serious = !!out.serious || !!existing?.serious || /\b(killed|died|dead|deaths?|shot|stabbed)\b/i.test(`${dek} ${happened}`);

  const story: StoryFile = {
    slug: existing?.slug ?? storySlug(out.slug_words || title, startedOn, taken),
    title,
    seoTitle: clip(out.seo_title, 70) || undefined,
    topic: TOPICS.has(out.topic) ? out.topic : existing?.topic ?? 'world',
    countries,
    status: out.status === 'settled' ? 'settled' : 'developing',
    ...(serious ? { serious: true } : {}),
    startedOn,
    dek,
    happened,
    happenedSources,
    sides,
    next: next || 'No next step has been announced in the sources.',
    nextSources: refs(out.next_sources),
    summary,
    sources,
    conflicts,
    verifiedAt: now,
    updatedAt: now,
    auto: true,
  };
  return { story };
}

/** /story/ukraine-kerch-bridge-strike-nov-2026 — set once, never changed (URLs are forever). */
export function storySlug(wordsIn: string, startedOn: string, taken: Set<string>): string {
  const [y, m] = startedOn.split('-');
  const w = slugify(wordsIn).split('-').filter(Boolean).slice(0, 6).join('-') || 'story';
  const base = `${w}-${MONTHS[Number(m) - 1]}-${y}`;
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

// ── Network ────────────────────────────────────────────────────────────────────

interface Item {
  title: string;
  link: string;
  publisher: string;
  publishedAt?: string;
}

function parseItems(xml: string): Item[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const tag = (t: string) => decode(b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? '');
    const publisher = tag('source');
    const t = Date.parse(tag('pubDate'));
    return {
      title: tag('title').replace(new RegExp(`\\s+-\\s+${publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''),
      link: tag('link'),
      publisher,
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    };
  });
}

async function headlines(log: (s: string) => void): Promise<HeadlineIn[]> {
  const out: HeadlineIn[] = [];
  await Promise.all(
    EDITIONS.map(async ([market, params]) => {
      try {
        const res = await get(`https://news.google.com/rss?${params}`);
        if (!res.ok) throw new Error(String(res.status));
        for (const i of parseItems(await res.text()).slice(0, 20)) out.push({ market, title: i.title, publisher: i.publisher });
      } catch (e) {
        log(`stories: ${market} headlines: ${(e as Error).message}`);
      }
    }),
  );
  return out;
}

/** Bing News RSS: links carry the article's own URL (url=…), so no lookups that Google rate-limits. */
async function bing(query: string, mkt = 'en-US'): Promise<Item[]> {
  const res = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&mkt=${mkt}`);
  if (!res.ok) throw new Error(`bing ${res.status}`);
  return parseItems(await res.text()).flatMap((i) => {
    try {
      const url = new URL(i.link).searchParams.get('url');
      return url && /^https?:\/\//.test(url) ? [{ ...i, link: url }] : [];
    } catch {
      return [];
    }
  });
}

/** Today's newsroom coverage for a story: one article per independent newsroom, text downloaded.
 *  Bing first; Google News (whose links need a lookup each, rate-limited after the protest
 *  searches earlier in the run) only when Bing gives fewer than two readable newsrooms. */
async function coverage(query: string, deadline: number): Promise<{ picked: Article[]; texts: string[] }> {
  const arts: Article[] = [];
  const texts = new Map<string, string>();
  const seen = new Set<string>();
  const read = async (url: string | undefined, i: Item) => {
    // MSN re-publishes other newsrooms' copy under its own domain: read the original instead.
    if (!url || isBlockedUrl(url) || publisherOf(url) === 'msn.com' || seen.has(publisherOf(url))) return;
    seen.add(publisherOf(url));
    try {
      const page = await fetchPage(url);
      if (page.text.length < 600) return;
      arts.push({ url, publisher: publisherOf(url), via: 'search', firstSeenAt: nowIso(), title: page.title || i.title, publishedAt: page.publishedAt || i.publishedAt, fetch: 'ok' });
      texts.set(url, page.text);
    } catch {
      /* paywalled or blocked: skip */
    }
  };
  const enough = () => arts.length >= LIMITS.storySources * 2 || Date.now() > deadline;
  try {
    // Bing returns ~12 items a query, sometimes 1–2 for a precise one (Nov 2026): ask three ways
    // (US and UK editions, and the query's first three words) for more newsrooms to choose from.
    const short = query.split(/\s+/).slice(0, 3).join(' ');
    const lists = await Promise.all([bing(query), bing(query, 'en-GB'), short !== query ? bing(short) : Promise.resolve([])]);
    const byUrl = new Map(lists.flat().map((i) => [i.link, i]));
    const recent = [...byUrl.values()].filter((i) => !i.publishedAt || hoursSince(i.publishedAt) < 48).slice(0, 24);
    await pool(recent, 4, async (i) => {
      if (!enough()) await read(i.link, i);
    });
  } catch {
    /* Bing down: Google below */
  }
  if (independentGroups(arts).length < RULES.minPublishers && !enough()) {
    const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}&hl=en-US&gl=US&ceid=US:en`);
    if (res.ok) {
      let blocked = false;
      for (const i of parseItems(await res.text()).slice(0, 10)) {
        if (blocked || enough()) break;
        try {
          await read(await gnewsUrl(i.link), i);
        } catch (e) {
          if (e instanceof Blocked) blocked = true;
        }
      }
    }
  }
  // One article per independent newsroom (wire copy re-published across sites counts once), newest first.
  const picked = independentGroups(arts)
    .map((g) => g[0])
    .sort((a, b) => ((a.publishedAt ?? '') < (b.publishedAt ?? '') ? 1 : -1))
    .slice(0, LIMITS.storySources);
  return { picked, texts: picked.map((a) => texts.get(a.url) ?? '') };
}

// ── The step ───────────────────────────────────────────────────────────────────

export async function refreshStories(ai: Ai, state: State, log: (s: string) => void): Promise<string[]> {
  if (!storiesDue(state)) return [];
  const stories = loadStories();
  const taken = new Set(stories.keys());
  const today = nowIso().slice(0, 10);

  const heads = await headlines(log);
  if (heads.length < 20) {
    log(`stories: only ${heads.length} headlines, trying again next run`);
    return [];
  }
  // Stories a reader can still see on the home page (checked in the last 10 days) can be updated.
  const known = [...stories.values()]
    .filter((s) => hoursSince(s.verifiedAt) < 10 * 24)
    .map((s) => ({ slug: s.slug, title: s.title, checked: s.verifiedAt.slice(0, 10) }));
  let pick: StoryPickOut;
  try {
    pick = await ai.json<StoryPickOut>('story-pick', SYSTEM, storyPickPrompt(today, heads, known, { all: LIMITS.storiesPerDay, updates: LIMITS.storyUpdatesPerDay }), storyPickSchema, `pick-${today}`);
  } catch (e) {
    if (e instanceof Pending) return (log(`stories: pick queued (${e.key})`), []);
    throw e; // OverBudget and real errors: the day stays due, the next run tries again
  }
  state.storiesDay = today; // picked: whatever happens below, today's refresh is done

  let updates = 0;
  const picks = (pick?.picks ?? [])
    .filter((p) => p && p.query)
    .map((p) => ({ ...p, existing: p.existing_slug ? stories.get(p.existing_slug) : undefined }))
    .filter((p) => !p.existing || ++updates <= LIMITS.storyUpdatesPerDay)
    .slice(0, LIMITS.storiesPerDay);
  log(`stories: ${picks.length} picked from ${heads.length} headlines (${picks.filter((p) => p.existing).length} updates)`);

  const deadline = Date.now() + LIMITS.storySeconds * 1000;
  const written: string[] = [];
  for (const p of picks) {
    const name = p.existing?.slug ?? `"${clip(p.label, 60)}"`;
    if (Date.now() > deadline) {
      log(`stories: out of search time before ${name}`);
      break;
    }
    let found: { picked: Article[]; texts: string[] };
    try {
      found = await coverage(p.query, deadline);
    } catch (e) {
      log(`stories: ${name}: ${(e as Error).message}`);
      continue;
    }
    if (independentGroups(found.picked).length < RULES.minPublishers) {
      log(`stories: ${name}: ${found.picked.length} newsroom(s) readable, not enough`);
      continue;
    }
    const srcs: SummarySource[] = found.picked.map((a, i) => ({
      n: i + 1, publisher: a.publisher, published: a.publishedAt?.slice(0, 16), title: a.title || '', text: found.texts[i].slice(0, 3000),
    }));
    const prev = p.existing ? { title: p.existing.title, dek: p.existing.dek, summary: p.existing.summary } : null;
    let out: StoryOut;
    try {
      out = await ai.json<StoryOut>('story', SYSTEM, storyPrompt(nowIso().slice(0, 16), clip(p.label, 120), prev, srcs), storySchema, `${today}-${slugify(p.query)}`);
    } catch (e) {
      if (e instanceof Pending) {
        log(`stories: ${name} queued (${e.key})`);
        continue;
      }
      if (e instanceof OverBudget) throw e;
      log(`stories: ${name} failed: ${(e as Error).message}`);
      continue;
    }
    const r = check({ out, picked: found.picked, texts: found.texts, existing: p.existing, taken });
    if ('reason' in r) {
      log(`stories: ${name} not published: ${r.reason}`);
      continue;
    }
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), `${r.story.slug}.json`), JSON.stringify(r.story, null, 1) + '\n');
    stories.set(r.story.slug, r.story);
    written.push(r.story.slug);
    log(`stories: ${p.existing ? 'updated' : 'new'} ${r.story.slug} (${r.story.sources.length} sources)`);
  }
  return written;
}
