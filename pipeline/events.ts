import type { Article, Place, ProtestEvent } from './types.ts';
import { nowIso, publisherOf, sha, titleSimilarity } from './util.ts';

export function newEvent(label: string, place: Place, date: string, causes: string[], seed: string): ProtestEvent {
  const now = nowIso();
  return {
    id: `e${sha(seed + now, 10)}`,
    slug: '',
    stage: 'candidate',
    title: label,
    seoTitle: '',
    place,
    scope: 'local',
    causes,
    kind: 'one-day',
    startedOn: date,
    status: 'ongoing',
    vibe: 'heating-up',
    severity: 'normal',
    review: 'auto',
    reviewReasons: [],
    isOngoing: true,
    published: false,
    tea: { why: '', want: '', changed: '' },
    summary: '',
    organizers: [],
    demands: [],
    response: '',
    numbers: {},
    updates: [],
    sources: [],
    conflicts: [],
    confidence: 0,
    publishers: 0,
    reports24h: 0,
    reportsPrev24h: 0,
    reports48h: 0,
    firstSeenAt: now,
    lastReportAt: now,
    lastCheckedAt: now,
    updatedAt: now,
  };
}

/** When an article was reported: the page's own date, else when we first saw it. */
export const reportedAt = (a: Article) =>
  a.publishedAt && Date.parse(a.publishedAt) <= Date.parse(a.firstSeenAt) + 36e5 ? a.publishedAt : a.firstSeenAt;

/**
 * Independent publishers among articles: sister titles of one group collapse
 * (publisherOf), and near-identical headlines across outlets count once
 * (re-published wire copy is one report, not several).
 */
export function independentGroups(articles: Article[]): Article[][] {
  const groups: Article[][] = [];
  for (const a of articles) {
    const g = groups.find((grp) =>
      grp.some((b) => publisherOf(b.url) === publisherOf(a.url) || titleSimilarity(b.title || '', a.title || '') >= 0.6),
    );
    if (g) g.push(a);
    else groups.push([a]);
  }
  return groups;
}

/** Deterministic fallback match when the AI did not link an article to a known event. */
export function findSimilar(events: Iterable<ProtestEvent>, label: string, place: Place, date: string): ProtestEvent | undefined {
  let best: ProtestEvent | undefined;
  let bestScore = 0;
  for (const e of events) {
    if (e.place.country !== place.country || e.place.citySlug !== place.citySlug) continue;
    if (e.review === 'rejected' || e.mergedInto) continue;
    const s = Math.max(titleSimilarity(label, e.title), titleSimilarity(label, e.seoTitle || ''));
    // A near-identical label is the same campaign even across a few weeks (a rally
    // announced for later in the month); a loosely similar one must be close in time.
    const gap = Math.abs(Date.parse(date) - Date.parse(e.endedOn || e.startedOn)) / 864e5;
    if (!(gap <= (s >= 0.8 ? 21 : 7))) continue;
    if (s >= 0.35 && s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}
