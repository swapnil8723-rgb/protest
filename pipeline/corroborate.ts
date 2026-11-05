// Step: look for a second newsroom. Many single-source candidates were covered by other
// outlets our GDELT/RSS discovery never saw (a Tallahassee campus protest reached us via
// one site while TheGrio and The Root also ran it, Oct 2026), so they never reached the
// two-publisher bar while still live. For the freshest ones, ask Google News for other
// coverage. Whatever comes back is only a lead: it goes through the normal fetch →
// keyword gate → classify → two-independent-publisher check, so no rule is relaxed.
import type { ProtestEvent } from './types.ts';
import { hoursSince, isBlockedUrl, pool, publisherOf } from './util.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const STOP = new Set(['protest', 'protests', 'protesters', 'rally', 'rallies', 'march', 'students', 'residents', 'workers', 'against', 'over', 'with', 'from', 'hold', 'holds', 'held', 'demand', 'demanding', 'outside']);

/** The newest article we hold for a story, in the language its newsroom wrote it. */
export interface Original {
  title: string;
  lang?: string;
}

/** Google News edition for a search: the source's own language in its country (taz → DE:de),
 *  else English. Local newsrooms are found by their own words, not by our English title. */
export function edition(country: string, lang?: string): { q: 'local' | 'en'; params: string } {
  const l = lang?.slice(0, 2).toLowerCase();
  if (!l || l === 'en') return { q: 'en', params: 'hl=en-US&gl=US&ceid=US:en' };
  const cc = country.toUpperCase();
  const id = cc === 'PT' && l === 'pt' ? 'pt-150' : l; // Portugal's edition is pt-150
  return { q: 'local', params: `hl=${id}&gl=${cc}&ceid=${cc}:${id}` };
}

export interface Lead {
  url: string;
  title: string;
  publishedAt?: string;
  eventId: string;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)?.filter((w) => !STOP.has(w)) ?? []);
export const get = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, headers: { 'user-agent': UA, ...init.headers }, signal: AbortSignal.timeout(10000) });

export class Blocked extends Error {}

/** news.google.com/rss/articles/<id> → the publisher's own URL (two requests). */
export async function decode(link: string): Promise<string | undefined> {
  const id = new URL(link).pathname.split('/').pop()!;
  const res = await get(`https://news.google.com/rss/articles/${id}`);
  if (res.status === 429) throw new Blocked();
  const page = await res.text();
  const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return;
  const req = [[['Fbv4je', `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`, null, 'generic']]];
  const r = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'f.req=' + encodeURIComponent(JSON.stringify(req)),
  });
  if (r.status === 429) throw new Blocked();
  const url = (await r.text()).match(/\\"garturlres\\",\\"(.*?)\\"/)?.[1];
  return url && /^https?:\/\//.test(url) ? url : undefined;
}

/** A story that found nothing is searched again this much later: every other run, so a
 *  story gets ~8 tries in its 48 hours, not 4 (12 h left FU Berlin's occupation, Oct 2026,
 *  locked out after one failed search). */
export const SEARCH_AGAIN_HOURS = 6;

/** Fresh stories one newsroom short, newest first, taken in turn from each country: single-source
 *  candidates, and confirmed events held for a third newsroom (harm, or sources that disagree). */
export function toSearch(events: Iterable<ProtestEvent>, publishersOf: (id: string) => Set<string>, max: number, now = Date.now()): ProtestEvent[] {
  const byCountry = new Map<string, ProtestEvent[]>();
  for (const e of [...events].sort((a, b) => (a.lastReportAt < b.lastReportAt ? 1 : -1))) {
    if (e.notReal || e.mergedInto || e.withdrawn || e.review === 'rejected') continue;
    if (hoursSince(e.lastReportAt, now) > 48 || (e.searchedAt && hoursSince(e.searchedAt, now) < SEARCH_AGAIN_HOURS)) continue;
    const n = publishersOf(e.id).size;
    const held = e.stage === 'live' && !e.published && n < 3 && e.reviewReasons.some((r) => r !== 'low-confidence' && r !== 'top-10');
    if (!(e.stage === 'candidate' && n === 1) && !held) continue;
    (byCountry.get(e.place.country) ?? byCountry.set(e.place.country, []).get(e.place.country)!).push(e);
  }
  const out: ProtestEvent[] = [];
  const lists = [...byCountry.values()];
  for (let i = 0; out.length < max && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
  return out;
}

export async function corroborate(
  events: Iterable<ProtestEvent>,
  publishersOf: (id: string) => Set<string>,
  originalOf: (id: string) => Original | undefined,
  log: (s: string) => void,
  opts: { max: number; perEvent: number; budgetMs: number },
): Promise<Lead[]> {
  const t0 = Date.now();
  const todo = toSearch(events, publishersOf, opts.max);
  const leads: Lead[] = [];
  let blocked = false;
  let local = 0;
  await pool(todo, 3, async (e) => {
    if (blocked || Date.now() - t0 > opts.budgetMs) return;
    e.searchedAt = new Date().toISOString();
    const have = publishersOf(e.id);
    const seen = new Set<string>();
    // One query in one Google News edition; returns the other newsrooms it found.
    const search = async (title: string, params: string) => {
      const before = seen.size;
      const q = `${title.replace(/["“”„«»]/g, '')} when:3d`;
      const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${params}`);
      if (res.status === 429) throw new Blocked();
      const xml = await res.text();
      const want = words(`${title} ${e.place.city}`);
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        if (seen.size >= opts.perEvent || blocked) break;
        const link = m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1];
        const src = m[1].match(/<source url="([^"]+)"/)?.[1];
        const title = (m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
        const pub = Date.parse(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
        if (!link || !src) continue;
        const host = publisherOf(src);
        if (have.has(host) || seen.has(host) || isBlockedUrl(src)) continue;
        if (Number.isFinite(pub) && Date.now() - pub > 4 * 864e5) continue;
        // Cheap relevance check before spending fetches and an AI read on it.
        const shared = [...words(title)].filter((w) => want.has(w)).length;
        if (shared < 2) continue;
        const url = await decode(link);
        if (!url || publisherOf(url) !== host || isBlockedUrl(url)) continue;
        seen.add(host);
        leads.push({ url, title: title.replace(/\s+-\s+[^-]+$/, ''), publishedAt: Number.isFinite(pub) ? new Date(pub).toISOString() : undefined, eventId: e.id });
      }
      return seen.size - before;
    };
    try {
      const orig = originalOf(e.id);
      const ed = edition(e.place.country, orig?.lang);
      // A local newsroom's story is found by its own headline in its own edition (taz → DE:de);
      // if that finds nothing, try our English title too (DW, The Local, wires).
      if (ed.q === 'local') {
        local++;
        if (await search(orig!.title.replace(/^\(S\+\)\s*/, ''), ed.params)) return;
      }
      await search(e.title, edition(e.place.country).params);
    } catch (err) {
      if (err instanceof Blocked) blocked = true;
      else log(`search ${e.id}: ${(err as Error).message.slice(0, 80)}`);
    }
  });
  log(`search: ${todo.length} single-source stories checked (${local} in their own language), ${leads.length} other newsrooms found${blocked ? ' (rate-limited, stopped early)' : ''}`);
  return leads;
}
