// Build-time access to the pipeline's output (DATA_DIR, default ./data).
// Only published events with a slug ever reach a page.
import fs from 'node:fs';
import path from 'node:path';
import { byIso, COUNTRIES, type Country } from '../../pipeline/config.ts';
import { loadEvents } from '../../pipeline/store.ts';
import type { ProtestEvent, State } from '../../pipeline/types.ts';
import { countryName, href, type Lang } from '../i18n/index.ts';
import { hasLang } from '../i18n/event.ts';

export type { ProtestEvent, Country };
export { COUNTRIES, byIso };

const dataDir = path.resolve(process.env.DATA_DIR || 'data');

const VIBE_ORDER = { 'peak-loud': 0, tense: 1, 'heating-up': 2, 'cooling-down': 3, 'wrapped-up': 4 } as const;

/** Sent in by a reader and not yet confirmed by two newsrooms (orange "Reader report" card). */
export const isUnverified = (e: ProtestEvent) => e.origin === 'reader' && e.stage !== 'live';

/** Everything shown on the site, verified first. */
export const events: ProtestEvent[] = [...loadEvents(dataDir).values()]
  .filter((e) => e.published && e.slug && (e.stage === 'live' || e.origin === 'reader'))
  .sort((a, b) => {
    if (a.isOngoing !== b.isOngoing) return a.isOngoing ? -1 : 1;
    if (isUnverified(a) !== isUnverified(b)) return isUnverified(a) ? 1 : -1;
    if (a.isOngoing) {
      const v = VIBE_ORDER[a.vibe] - VIBE_ORDER[b.vibe];
      if (v) return v;
      if (b.reports48h !== a.reports48h) return b.reports48h - a.reports48h;
    }
    return a.lastReportAt < b.lastReportAt ? 1 : -1;
  });

/** Newsroom-verified only: sitemaps, news sitemap, feed, llms.txt, city pages, related. */
export const verified = events.filter((e) => !isUnverified(e));
export const readerReports = events.filter(isUnverified);
export const live = events.filter((e) => e.isOngoing);
export const liveVerified = verified.filter((e) => e.isOngoing);
export const wrapped = events.filter((e) => !e.isOngoing);

const state: Partial<State> = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  } catch {
    return {};
  }
})();

/** When the pipeline last ran — the honest "checked" time for every page. */
export const lastRunAt = state.lastRunAt ?? new Date().toISOString();
export const builtAt = new Date().toISOString();
export const sourcesChecked24h = (state.runs ?? [])
  .filter((r) => Date.now() - Date.parse(r.at) < 864e5)
  .reduce((n, r) => n + r.fetched, 0);

export const country = (iso: string) => byIso.get(iso)!;
export const countryOf = (e: ProtestEvent) => byIso.get(e.place.country)!;
/** Country name in the page language. */
export const cname = (c: Country, lang: Lang = 'en') => countryName(c.iso, lang, c.name);
/** An event's page in `lang`, or the English page while it has no translation yet. */
export const eventUrl = (e: ProtestEvent, lang: Lang = 'en') => href(hasLang(e, lang) ? lang : 'en', `/p/${e.slug}`);
export const countryUrl = (c: Country, lang: Lang = 'en') => href(lang, `/country/${c.slug}`);
export const cityKey = (e: ProtestEvent) => `${e.place.country}/${e.place.regionSlug}/${e.place.citySlug}`;

/** City pages exist only for cities with ≥ 2 published events (no thin pages). */
export const cities = (() => {
  const m = new Map<string, ProtestEvent[]>();
  for (const e of verified) (m.get(cityKey(e)) ?? m.set(cityKey(e), []).get(cityKey(e))!).push(e);
  return new Map([...m].filter(([, list]) => list.length >= 2));
})();
export const cityUrl = (e: ProtestEvent, lang: Lang = 'en') => (cities.has(cityKey(e)) ? href(lang, `/city/${cityKey(e)}`) : null);

export const inCountry = (iso: string) => events.filter((e) => e.place.country === iso);

export function related(e: ProtestEvent, n = 4): ProtestEvent[] {
  const score = (o: ProtestEvent) =>
    (o.place.citySlug === e.place.citySlug && o.place.country === e.place.country ? 3 : 0) +
    o.causes.filter((c) => e.causes.includes(c)).length * 2 +
    (o.place.country === e.place.country ? 1 : 0) +
    (o.isOngoing ? 1 : 0);
  return verified
    .filter((o) => o.id !== e.id)
    .map((o) => [o, score(o)] as const)
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([o]) => o);
}

export const allCauses = [...new Set(events.flatMap((e) => e.causes))].sort();

/** Report-volume quintile → 1..5 bars on the volume meter. */
export function loudness(e: ProtestEvent): number {
  const v = e.reports48h + e.publishers;
  return v >= 20 ? 5 : v >= 12 ? 4 : v >= 7 ? 3 : v >= 4 ? 2 : 1;
}
