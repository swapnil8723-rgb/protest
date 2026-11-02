// Step: fold duplicate events together before summaries are written. Classify matches one
// article at a time, so the same protest reported under different angles ("Gen Z march" /
// "evening clashes and looting") can open twin events in one city; each then reaches two
// newsrooms and goes live on its own page (Frankfurt had three for one night, 31 Oct 2026).
// Here every same-city pair with overlapping dates goes to one AI call; pairs it calls the
// same protest are merged (mergeInto), pairs it calls different are remembered and never re-asked.
import type { Ai } from './ai.ts';
import { OverBudget, Pending } from './ai.ts';
import { mergeInto } from './events.ts';
import { dedupePrompt, dedupeSchema, SYSTEM, type DedupeOut, type DedupePair } from './prompts.ts';
import type { Article, ProtestEvent } from './types.ts';
import { hoursSince, sha } from './util.ts';

/** Most pairs judged in one run (one AI call). */
export const MAX_PAIRS = 30;
/** Start dates further apart than this are different protests, unless one is still running. */
const DAYS_APART = 2;

const day = (iso: string) => Date.parse(iso.slice(0, 10));
const isShown = (e: ProtestEvent) => e.published && !!e.slug && e.stage === 'live';

/** Pairs worth asking about: same city, dates overlapping, neither already judged different. */
export function dedupePairs(events: Iterable<ProtestEvent>): [ProtestEvent, ProtestEvent][] {
  const open = [...events].filter(
    (e) => !e.mergedInto && !e.withdrawn && !e.notReal && e.review !== 'rejected' && e.origin !== 'reader' && hoursSince(e.lastReportAt) < 10 * 24,
  );
  const byCity = new Map<string, ProtestEvent[]>();
  for (const e of open) {
    const k = `${e.place.country}/${e.place.citySlug}`;
    (byCity.get(k) ?? byCity.set(k, []).get(k)!).push(e);
  }
  const pairs: [ProtestEvent, ProtestEvent][] = [];
  for (const list of byCity.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        if (a.distinctFrom?.includes(b.id) || b.distinctFrom?.includes(a.id)) continue;
        // Two hidden one-source candidates are left alone: they cost nothing on the site,
        // and most of them never find a second newsroom.
        if (!isShown(a) && !isShown(b) && a.publishers < 2 && b.publishers < 2) continue;
        const [first, second] = a.startedOn <= b.startedOn ? [a, b] : [b, a];
        const runsUntil = day(first.endedOn || first.lastReportAt);
        const gap = (day(second.startedOn) - day(first.startedOn)) / 864e5;
        if (gap > DAYS_APART && day(second.startedOn) > runsUntil) continue;
        pairs.push([a, b]);
      }
    }
  }
  // Pairs with a page on the site first: those are the duplicates readers see.
  const weight = ([a, b]: [ProtestEvent, ProtestEvent]) => Number(isShown(a)) + Number(isShown(b));
  return pairs.sort((x, y) => weight(y) - weight(x)).slice(0, MAX_PAIRS);
}

/** Which event keeps its page: the one live longest (its URL is the one search engines know),
 *  else the better-sourced one, else the older one. */
export function keeper(a: ProtestEvent, b: ProtestEvent): [ProtestEvent, ProtestEvent] {
  if (isShown(a) !== isShown(b)) return isShown(a) ? [a, b] : [b, a];
  if (a.publishedAt && b.publishedAt && a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? [a, b] : [b, a];
  if (a.publishers !== b.publishers) return a.publishers > b.publishers ? [a, b] : [b, a];
  return a.firstSeenAt <= b.firstSeenAt ? [a, b] : [b, a];
}

const remember = (a: ProtestEvent, b: ProtestEvent) => {
  a.distinctFrom = [...(a.distinctFrom ?? []), b.id].slice(-40);
  b.distinctFrom = [...(b.distinctFrom ?? []), a.id].slice(-40);
};

export async function dedupe(
  ai: Ai,
  events: Map<string, ProtestEvent>,
  articles: Map<string, Article>,
  log: (s: string) => void,
): Promise<number> {
  const pairs = dedupePairs(events.values());
  if (!pairs.length) return 0;
  const titlesOf = new Map<string, string[]>();
  for (const a of articles.values()) {
    if (!a.eventId || !a.title) continue;
    const list = titlesOf.get(a.eventId) ?? titlesOf.set(a.eventId, []).get(a.eventId)!;
    if (list.length < 4) list.push(a.title);
  }
  const describe = (e: ProtestEvent) => ({
    title: e.title,
    since: e.startedOn,
    summary: e.summary.slice(0, 400),
    organizers: e.organizers,
    headlines: titlesOf.get(e.id) ?? [],
  });
  const input: DedupePair[] = pairs.map(([a, b], i) => ({ id: `p${i + 1}`, city: `${a.place.city}, ${a.place.country}`, a: describe(a), b: describe(b) }));

  let out: DedupeOut;
  try {
    out = await ai.json<DedupeOut>('dedupe', SYSTEM, dedupePrompt(input), dedupeSchema, sha(pairs.map(([a, b]) => a.id + b.id).join('|'), 16));
  } catch (e) {
    if (e instanceof Pending) {
      log(`dedupe: queued for answer (${e.key})`);
      return 0;
    }
    if (e instanceof OverBudget) throw e;
    log(`dedupe: failed: ${(e as Error).message}`);
    return 0;
  }

  let merged = 0;
  const verdict = new Map((out.pairs ?? []).map((p) => [p.id, p.same]));
  pairs.forEach(([a, b], i) => {
    const same = verdict.get(`p${i + 1}`);
    if (same === undefined) return; // not answered: asked again next run
    if (!same) return remember(a, b);
    // An earlier pair in this run may have merged one side already: follow it.
    const live = (e: ProtestEvent) => (e.mergedInto ? events.get(e.mergedInto) ?? e : e);
    const [x, y] = [live(a), live(b)];
    if (x.id === y.id) return;
    const [keep, drop] = keeper(x, y);
    const moved = mergeInto(keep, drop, events, articles);
    merged++;
    log(`dedupe: merged ${drop.id}${drop.slug ? ` (${drop.slug})` : ''} into ${keep.id}${keep.slug ? ` (${keep.slug})` : ''}, ${moved} articles`);
  });
  return merged;
}
