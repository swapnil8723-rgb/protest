// Step: write (or refresh) the event card from its sources. Runs only when an event
// has ≥ 2 independent publishers AND its source set changed since the last summary.
import type { Ai } from './ai.ts';
import { OverBudget, Pending } from './ai.ts';
import { fetchPage, type Page } from './article.ts';
import { byIso, CAUSES, LIMITS, RULES } from './config.ts';
import { independentGroups, reportedAt } from './events.ts';
import { SYSTEM, summaryPrompt, summarySchema, type SummaryOut, type SummarySource } from './prompts.ts';
import type { Article, Figure, ProtestEvent, SourceRef } from './types.ts';
import { MONTHS, nowIso, pool, sha, slugify } from './util.ts';
import { decode } from './rss.ts';

const causeSet = new Set<string>(CAUSES);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

/** Pick up to N sources from different independent groups: the 3 newest (what changed)
 *  plus picks spread evenly across the event's timeline (so the main day and how it
 *  started are covered, not just today's follow-ups). */
export function pickSources(articles: Article[], n = LIMITS.summarySources): Article[] {
  const groups = independentGroups(articles);
  const groupOf = new Map<Article, number>();
  groups.forEach((g, i) => g.forEach((a) => groupOf.set(a, i)));
  const byTime = [...articles].sort((a, b) => (reportedAt(a) < reportedAt(b) ? -1 : 1));
  const used = new Set<number>();
  const out: Article[] = [];
  const take = (a: Article | undefined) => {
    if (!a || out.length >= n || used.has(groupOf.get(a)!)) return false;
    used.add(groupOf.get(a)!);
    out.push(a);
    return true;
  };
  for (let i = byTime.length - 1, k = 0; i >= 0 && k < 3; i--) if (take(byTime[i])) k++;
  const slots = n - out.length;
  for (let s = 0; s < slots; s++) {
    // walk forward from the evenly spaced index to the first article of an unused group
    for (let i = Math.floor((s * byTime.length) / Math.max(1, slots)); i < byTime.length; i++) if (take(byTime[i])) break;
  }
  for (const a of byTime) take(a); // fill if spacing collided
  return out.sort((a, b) => (reportedAt(a) < reportedAt(b) ? -1 : 1));
}

export function sourceHash(articles: Article[]) {
  return sha(articles.map((a) => a.url).sort().join('|'));
}

export interface SummarizeOptions {
  max?: number;
  /** Events already summarised earlier in this run: left for the next run. */
  skip?: Set<string>;
  /** Article text this run already fetched (url → page), so sources are not downloaded twice. */
  pages?: Map<string, Page>;
  /** Summaries written side by side (each still waits for its AI slot in ai.ts). */
  concurrency?: number;
}

export async function summarize(
  ai: Ai,
  events: Map<string, ProtestEvent>,
  articles: Map<string, Article>,
  log: (s: string) => void,
  opts: SummarizeOptions = {},
): Promise<string[]> {
  const maxPerRun = opts.max ?? Number(process.env.SUMMARIES_PER_RUN || 40);
  const byEvent = new Map<string, Article[]>();
  for (const a of articles.values()) {
    if (!a.eventId || a.fetch !== 'ok') continue;
    (byEvent.get(a.eventId) ?? byEvent.set(a.eventId, []).get(a.eventId)!).push(a);
  }
  const due = [...events.values()]
    .filter((e) => e.review !== 'rejected' && !e.mergedInto && !opts.skip?.has(e.id))
    .map((e) => ({ e, arts: byEvent.get(e.id) ?? [] }))
    .filter(({ e, arts }) => independentGroups(arts).length >= RULES.minPublishers && e.summaryOf !== sourceHash(arts))
    // live events first (readers are waiting), then the best-sourced candidates
    .sort((x, y) => (x.e.stage === y.e.stage ? independentGroups(y.arts).length - independentGroups(x.arts).length : x.e.stage === 'live' ? -1 : 1))
    .slice(0, maxPerRun);

  const done: string[] = [];
  // Sources download while other summaries wait for the AI, instead of one event at a time.
  let stopped: unknown;
  await pool(due, opts.concurrency ?? 3, async ({ e, arts }) => {
    if (stopped) return;
    opts.skip?.add(e.id); // one attempt per event per run, whatever the outcome
    const picked = pickSources(arts);
    const texts = await Promise.all(
      picked.map(async (a) => {
        const cached = opts.pages?.get(a.url)?.text;
        if (cached) return cached;
        try {
          const page = await fetchPage(a.url);
          opts.pages?.set(a.url, page);
          return page.text;
        } catch {
          return a.description || '';
        }
      }),
    );
    if (stopped) return;
    const srcs: SummarySource[] = picked.map((a, i) => ({ n: i + 1, publisher: a.publisher, published: a.publishedAt?.slice(0, 16), title: a.title || '', text: texts[i].slice(0, 2500) }));
    const place = `${e.place.city}, ${e.place.region ? e.place.region + ', ' : ''}${byIso.get(e.place.country)?.name}`;
    let out: SummaryOut;
    try {
      out = await ai.json<SummaryOut>('summary', SYSTEM, summaryPrompt(nowIso().slice(0, 16), place, e.title, srcs), summarySchema, `${e.id}-${sourceHash(picked)}`);
    } catch (err) {
      if (err instanceof Pending) {
        log(`summary: ${e.id} queued for answer (${err.key})`);
        return;
      }
      if (err instanceof OverBudget) {
        stopped = err; // out of time or AI: the rest wait for the next run
        return;
      }
      log(`summary: ${e.id} failed: ${(err as Error).message}`);
      return;
    }
    const hash = sourceHash(arts);
    const applied = apply(e, out, picked, arts, log);
    e.summaryOf = hash;
    if (applied) done.push(e.id);
  });
  if (stopped) {
    if (done.length) log(`summary: ${done.length} written before the stop`);
    throw stopped;
  }
  return done;
}

/** Validate a summary and write it onto the event. Returns false if rejected. */
export function apply(e: ProtestEvent, out: SummaryOut, picked: Article[], all: Article[], log: (s: string) => void): boolean {
  const now = nowIso();
  if (!out || typeof out !== 'object') return false;
  if (!out.is_real) {
    if (e.stage === 'candidate') e.notReal = clip(out.not_real_reason || 'sources do not describe a real protest', 160);
    log(`summary: ${e.id} judged not real: ${out.not_real_reason}`);
    return false;
  }
  // Keep only sources the model says are about this protest; renumber 1..k.
  const keepN = (out.same_story_sources ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= picked.length);
  const kept = [...new Set(keepN)].sort((a, b) => a - b);
  const keptArts = kept.map((n) => picked[n - 1]);
  if (independentGroups(keptArts).length < RULES.minPublishers) {
    log(`summary: ${e.id} only ${independentGroups(keptArts).length} independent publisher(s) on-story — not applied`);
    return false;
  }
  const renum = new Map(kept.map((old, i) => [old, i + 1]));
  const refs = (ns: unknown) =>
    [...new Set((Array.isArray(ns) ? ns : []).map((n) => renum.get(Number(n))).filter((n): n is number => !!n))].sort((a, b) => a - b);
  const figure = (f: SummaryOut['crowd']): Figure | undefined => {
    if (!f || !Number.isFinite(f.value) || f.value < 0) return undefined;
    const sources = refs(f.sources);
    if (!sources.length) return undefined; // a number with no receipt is not shown
    return { value: Math.round(f.value), text: clip(f.text, 120), sources };
  };

  // Articles the model says are off-story leave this event.
  const offStory = new Set(picked.filter((_, i) => !kept.includes(i + 1)).map((a) => a.url));
  for (const a of all) if (offStory.has(a.url)) a.eventId = undefined;

  const sources: SourceRef[] = keptArts.map((a, i) => ({
    n: i + 1,
    url: a.url,
    publisher: a.publisher,
    title: clip(decode(a.title || ''), 200),
    publishedAt: a.publishedAt,
  }));

  const today = now.slice(0, 10);
  const started = DATE.test(out.started_on) && out.started_on <= addDays(today, 60) ? out.started_on : e.startedOn;
  const status = ['ongoing', 'ended', 'called-off', 'demands-met', 'scheduled'].includes(out.status) ? out.status : 'ongoing';

  const next: Partial<ProtestEvent> = {
    title: clip(out.title, 100) || e.title,
    seoTitle: clip(out.seo_title, 52) || clip(out.title, 52),
    scope: ['local', 'multi-city', 'nationwide'].includes(out.scope) ? out.scope : 'local',
    kind: out.kind === 'multi-day' ? 'multi-day' : 'one-day',
    startedOn: started,
    endedOn: out.ended_on && DATE.test(out.ended_on) && out.ended_on >= started ? out.ended_on : undefined,
    status,
    tea: { why: clip(out.tea_why, 160), want: clip(out.tea_want, 160), changed: clip(out.tea_changed, 170) },
    summary: clip(out.summary, 1400),
    organizers: (out.organizers ?? []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 6),
    demands: (out.demands ?? []).map((d) => clip(d, 140)).filter(Boolean).slice(0, 5),
    response: clip(out.response, 340) || 'No official response reported in the sources.',
    responseSources: refs(out.response_sources),
    numbers: {
      crowd: figure(out.crowd),
      arrests: figure(out.arrests),
      injuries: figure(out.injuries),
      deaths: figure(out.deaths),
    },
    updates: (out.updates ?? [])
      .filter((u) => u && /^\d{4}-\d{2}-\d{2}/.test(u.date) && u.text)
      .map((u) => ({ at: u.date.slice(0, 10), text: clip(u.text, 180), sources: refs(u.sources) }))
      .filter((u) => u.sources.length)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .slice(-8),
    sources,
    conflicts: (out.conflicts ?? []).map((c) => clip(c, 200)).filter(Boolean).slice(0, 4),
    causes: [...new Set((out.causes ?? []).filter((c) => causeSet.has(c)))].slice(0, 3),
  };
  if (!next.causes!.length) next.causes = e.causes;
  // A rewrite reads only some of the sources, so it can miss the one with the count: a sourced total
  // of harm never falls or disappears (Frankfurt went from 100 injured to "one officer", Nov 2026).
  for (const k of ['arrests', 'injuries', 'deaths'] as const) {
    const old = e.numbers?.[k];
    if (!old || (next.numbers![k]?.value ?? -1) >= old.value) continue;
    const cited = old.sources.map((n) => e.sources.find((s) => s.n === n)).filter((s): s is SourceRef => !!s);
    if (!cited.length) continue;
    const ns = cited.map((s) => {
      const have = sources.find((x) => x.url === s.url);
      if (have) return have.n;
      sources.push({ ...s, n: sources.length + 1 });
      return sources.length;
    });
    next.numbers![k] = { ...old, sources: ns };
  }
  next.seriousInjuries = !!out.serious_injuries;
  next.sensitive = !!out.sensitive;

  const before = JSON.stringify(visible(e));
  Object.assign(e, next);
  if (!e.slug) e.slug = makeSlug(e, out.slug_words);
  e.stage = 'live';
  e.notReal = undefined;
  e.summarizedAt = now;
  if (JSON.stringify(visible(e)) !== before) e.updatedAt = now;
  return true;
}

/** The fields a reader sees — a change in these bumps dateModified. */
export const visible = (e: ProtestEvent) => [e.title, e.tea, e.summary, e.status, e.demands, e.response, e.numbers, e.updates, e.sources.map((s) => s.url)];

function addDays(day: string, n: number) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
}

const taken = new Set<string>();
export function reserveSlugs(events: Iterable<ProtestEvent>) {
  for (const e of events) if (e.slug) taken.add(e.slug);
}

/** /p/mumbai-anti-cec-march-oct-2026 — set once, never changed (URLs are forever). */
export function makeSlug(e: ProtestEvent, words: string): string {
  const [y, m] = e.startedOn.split('-');
  let w = slugify(words || e.seoTitle || e.title).split('-').filter((x) => x && x !== e.place.citySlug).slice(0, 6).join('-');
  if (!w) w = 'protest';
  const base = `${e.place.citySlug}-${w}-${MONTHS[Number(m) - 1]}-${y}`;
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}
