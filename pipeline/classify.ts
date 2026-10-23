// Step: decide, article by article, whether it reports a real protest, where, and
// which event it belongs to. Unmatched protests become hidden "candidate" events
// that only go public after the summary step confirms ≥ 2 independent publishers.
import type { Ai } from './ai.ts';
import { OverBudget, Pending } from './ai.ts';
import type { Page } from './article.ts';
import { byIso, CAUSES, LIMITS } from './config.ts';
import { findSimilar, newEvent } from './events.ts';
import { resolvePlace } from './geo.ts';
import { classifyPrompt, classifySchema, SYSTEM, type ClassifyOut, type KnownEvent } from './prompts.ts';
import type { Article, ProtestEvent } from './types.ts';
import { daysBetween, hoursSince, nowIso, sha } from './util.ts';

const causeSet = new Set<string>(CAUSES);

export function knownEvents(events: Map<string, ProtestEvent>): KnownEvent[] {
  const open = [...events.values()]
    .filter((e) => e.review !== 'rejected' && !e.notReal && !e.mergedInto && hoursSince(e.lastReportAt) < 10 * 24)
    .sort((a, b) => (a.lastReportAt < b.lastReportAt ? 1 : -1));
  // Published events first: dozens of single-source candidates arrive every day, and
  // ranking by recency alone pushed a running story off the list within days, so its
  // next articles started a new page (Paris had 12 pages for one movement, Oct 2026).
  return [...open.filter((e) => e.published), ...open.filter((e) => !e.published)]
    .slice(0, 150)
    .map((e) => ({ id: e.id, title: e.title, city: e.place.city, country: e.place.country, startedOn: e.startedOn, status: e.status }));
}

export async function classify(
  ai: Ai,
  todo: Article[],
  pages: Map<string, Page>,
  events: Map<string, ProtestEvent>,
  log: (s: string) => void,
): Promise<{ classified: number; protests: number }> {
  let classified = 0;
  let protests = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < todo.length; i += LIMITS.classifyBatch) {
    const batch = todo.slice(i, i + LIMITS.classifyBatch);
    const ids = new Map(batch.map((a, j) => [`a${j + 1}`, a]));
    const input = [...ids].map(([id, a]) => {
      const page = pages.get(a.url);
      return {
        id,
        publisher: a.publisher,
        published: a.publishedAt?.slice(0, 16),
        title: a.title || '',
        description: (a.description || '').slice(0, 300),
        excerpt: (page?.text || '').slice(0, 900),
      };
    });
    let out: ClassifyOut;
    try {
      const key = sha(batch.map((a) => a.url).join('|'), 16);
      out = await ai.json<ClassifyOut>('classify', SYSTEM, classifyPrompt(today, input, knownEvents(events)), classifySchema, key);
    } catch (e) {
      if (e instanceof Pending) {
        log(`classify: batch queued for answer (${e.key})`);
        continue;
      }
      if (e instanceof OverBudget) throw e;
      log(`classify: batch failed: ${(e as Error).message}`);
      continue;
    }
    // New stories in this batch, keyed by story_key + city, so their articles share one event.
    const fresh = new Map<string, ProtestEvent>();
    for (const r of out.articles ?? []) {
      const a = ids.get(r.id);
      if (!a) continue;
      classified++;
      const cls = (a.cls = {
        at: nowIso(),
        isProtest: !!r.is_protest,
        reason: r.not_reason ?? undefined,
        storyLabel: r.story_label ?? undefined,
        city: r.city ?? undefined,
        region: r.region ?? undefined,
        country: r.country?.toLowerCase() ?? undefined,
        date: /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') ? r.date! : undefined,
        causes: (r.causes ?? []).filter((c) => causeSet.has(c)).slice(0, 3),
        matchEventId: r.match_event_id,
        storyKey: r.story_key ?? undefined,
      });
      if (!cls.isProtest) continue;
      if (!cls.country || !byIso.has(cls.country)) {
        cls.isProtest = false;
        cls.reason = 'outside tracked countries';
        continue;
      }
      // A long-running sit-in can have started weeks ago; what must be recent is the
      // report itself (articles older than 12 days are dropped before this step).
      if (cls.date && daysBetween(cls.date, today) > 120) {
        cls.isProtest = false;
        cls.reason = 'started more than 120 days ago';
        continue;
      }
      const place = resolvePlace(cls.city, cls.region, cls.country);
      if (!place) {
        cls.isProtest = false;
        cls.reason = `place not resolved: ${cls.city ?? '?'}, ${cls.region ?? '?'}`;
        continue;
      }
      protests++;
      const date = cls.date || a.publishedAt?.slice(0, 10) || today;
      const label = cls.storyLabel || 'Protest';
      let ev = cls.matchEventId ? events.get(cls.matchEventId) : undefined;
      if (ev?.mergedInto) ev = events.get(ev.mergedInto);
      // One page per city: a matching campaign in another city gets its own event.
      if (ev && (ev.place.country !== place.country || ev.place.citySlug !== place.citySlug)) ev = undefined;
      if (!ev) ev = fresh.get(`${cls.storyKey}|${place.citySlug}`);
      if (!ev) ev = findSimilar(events.values(), label, place, date);
      if (!ev) {
        ev = newEvent(label, place, date, cls.causes ?? [], a.url);
        events.set(ev.id, ev);
        log(`classify: new candidate ${ev.id} "${label}" (${place.city})`);
      }
      if (cls.storyKey) fresh.set(`${cls.storyKey}|${place.citySlug}`, ev);
      a.eventId = ev.id;
    }
  }
  return { classified, protests };
}
