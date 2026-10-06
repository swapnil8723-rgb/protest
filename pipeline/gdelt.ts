// GDELT is used only to *discover* article URLs that its coders tagged as protest
// (CAMEO root 14) in a tracked country. Its geocoding and coding are too noisy to
// publish from directly (see PLAN §0), so every URL is read and classified later.
import { byFips, LIMITS } from './config.ts';
import { isBlockedUrl, unzipFirst } from './util.ts';

const BASE = 'http://data.gdeltproject.org';

export interface GdeltHit {
  url: string;
  codes: string[];
  fips: string;
  place: string;
  articles: number;
  added: string; // ISO
}

/** Column indexes differ between GDELT 2.0 15-min files (61 cols) and 1.0 daily files (58). */
function cols(n: number) {
  return n >= 61
    ? { geoName: 52, geoCountry: 53, added: 59, url: 60 }
    : { geoName: 50, geoCountry: 51, added: 56, url: 57 };
}

export function parseEvents(tsv: string, now = new Date()): GdeltHit[] {
  const minDate = new Date(now.getTime() - LIMITS.gdeltMaxAgeDays * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const hits = new Map<string, GdeltHit>();
  for (const line of tsv.split('\n')) {
    const r = line.split('\t');
    if (r.length < 58 || r[28] !== '14') continue;
    const c = cols(r.length);
    // SQLDATE is when the event happened per the article; old dates are anniversaries/recaps.
    if (r[1] < minDate) continue;
    if (!byFips.has(r[c.geoCountry])) continue;
    const url = r[c.url]?.trim();
    if (!url || !/^https?:\/\//.test(url) || isBlockedUrl(url)) continue;
    const d = r[c.added];
    const added = d?.length === 14
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}Z`
      : `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`;
    const prev = hits.get(url);
    if (prev) {
      if (!prev.codes.includes(r[26])) prev.codes.push(r[26]);
      prev.articles = Math.max(prev.articles, Number(r[33]) || 0);
    } else {
      hits.set(url, { url, codes: [r[26]], fips: r[c.geoCountry], place: r[c.geoName], articles: Number(r[33]) || 0, added });
    }
  }
  return [...hits.values()];
}

async function getZip(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return unzipFirst(Buffer.from(await res.arrayBuffer())).toString('utf8');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
const fromStamp = (s: string) =>
  new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00Z`);

/** Process every 15-minute export file after `cursor` (capped), newest last. */
export async function discoverRecent(cursor: string | undefined, log: (s: string) => void) {
  const latestTxt = await (await fetch(`${BASE}/gdeltv2/lastupdate.txt`, { signal: AbortSignal.timeout(30000) })).text();
  const m = latestTxt.match(/gdeltv2\/(\d{14})\.export\.CSV\.zip/);
  if (!m) throw new Error('GDELT lastupdate.txt: no export file');
  const latest = m[1];
  const stamps: string[] = [];
  let t = cursor ? fromStamp(cursor).getTime() + 15 * 60e3 : fromStamp(latest).getTime() - 60 * 60e3;
  const end = fromStamp(latest).getTime();
  for (; t <= end; t += 15 * 60e3) stamps.push(stamp(new Date(t)));
  const todo = stamps.slice(-LIMITS.gdeltMaxFiles);
  if (stamps.length > todo.length) log(`gdelt: ${stamps.length - todo.length} older files skipped (cap)`);
  const hits: GdeltHit[] = [];
  for (const s of todo) {
    try {
      hits.push(...parseEvents(await getZip(`${BASE}/gdeltv2/${s}.export.CSV.zip`)));
    } catch (e) {
      // GDELT occasionally skips a slot; a missing file is not fatal.
      log(`gdelt: ${s} ${(e as Error).message}`);
    }
  }
  return { hits, cursor: latest, files: todo.length };
}

/** Launch backfill: whole-day 1.0 export files (same events, one download per day). */
export async function discoverDays(days: string[], log: (s: string) => void) {
  const hits: GdeltHit[] = [];
  for (const d of days) {
    try {
      const h = parseEvents(await getZip(`${BASE}/events/${d.replace(/-/g, '')}.export.CSV.zip`), new Date(d + 'T23:59:59Z'));
      log(`gdelt day ${d}: ${h.length} protest URLs`);
      hits.push(...h);
    } catch (e) {
      log(`gdelt day ${d}: ${(e as Error).message}`);
    }
  }
  return hits;
}
