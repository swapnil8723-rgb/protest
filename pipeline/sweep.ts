// Step: look for protests country by country, in the local language. GDELT and the feeds
// miss most local reporting (Madrid's university strike, Basra's oil field shutdown and the
// 7 November marches in Bologna and Genoa were only found by hand, Nov 2026), and 13 European
// countries had no story at all in two weeks. Whatever comes back is only a lead: it goes
// through the normal fetch → keyword gate → classify → two-independent-publisher check.
import { Blocked, decode, get } from './corroborate.ts';
import { hostOf, isBlockedUrl, looksLikeProtest, pool, publisherOf, sha } from './util.ts';

export interface SweepQuery {
  cc: string;
  q: string;
  /** Google News edition: hl, gl and the language part of ceid. Omitted = English (US). */
  ed?: [string, string, string];
  /** The countries most of our readers and most of Europe's protests are in: more leads per run. */
  big?: boolean;
}

// A country with no working Google News edition in its own language (Denmark, Croatia, North
// Macedonia, Moldova returned nothing, Nov 2026) is searched in English by name.
export const SWEEP: SweepQuery[] = [
  { cc: 'gb', q: 'protest OR demonstration OR strike', ed: ['en-GB', 'GB', 'en'], big: true },
  { cc: 'fr', q: 'manifestation OR grève OR blocage', ed: ['fr', 'FR', 'fr'], big: true },
  { cc: 'de', q: 'Demo OR Protest OR Streik OR Warnstreik', ed: ['de', 'DE', 'de'], big: true },
  { cc: 'es', q: 'manifestación OR huelga OR protesta', ed: ['es', 'ES', 'es'], big: true },
  { cc: 'it', q: 'manifestazione OR corteo OR sciopero', ed: ['it', 'IT', 'it'], big: true },
  { cc: 'pl', q: 'protest OR manifestacja OR strajk', ed: ['pl', 'PL', 'pl'], big: true },
  { cc: 'nl', q: 'protest OR demonstratie OR staking', ed: ['nl', 'NL', 'nl'], big: true },
  { cc: 'be', q: 'manifestation OR grève OR betoging OR staking', ed: ['fr', 'BE', 'fr'], big: true },
  { cc: 'pt', q: 'manifestação OR greve OR protesto', ed: ['pt-150', 'PT', 'pt-150'], big: true },
  { cc: 'gr', q: 'διαδήλωση OR απεργία OR κινητοποίηση', ed: ['el', 'GR', 'el'], big: true },
  { cc: 'at', q: 'Demo OR Protest OR Streik', ed: ['de', 'AT', 'de'], big: true },
  { cc: 'ro', q: 'protest OR grevă OR miting', ed: ['ro', 'RO', 'ro'], big: true },
  { cc: 'tr', q: 'protesto OR eylem OR grev', ed: ['tr', 'TR', 'tr'], big: true },
  { cc: 'ua', q: 'протест OR мітинг OR страйк', ed: ['uk', 'UA', 'uk'], big: true },
  { cc: 'cn', q: 'China protest OR strike OR petition workers police', big: true },
  { cc: 'cn', q: 'Hong Kong protest', big: true },
  { cc: 'cn', q: '中國 抗議 OR 示威 OR 罷工 OR 維權', ed: ['zh-TW', 'HK', 'zh-Hant'], big: true },
  { cc: 'ch', q: 'Demo OR Protest OR Streik', ed: ['de', 'CH', 'de'] },
  { cc: 'se', q: 'demonstration OR strejk OR protest', ed: ['sv', 'SE', 'sv'] },
  { cc: 'dk', q: 'Denmark Copenhagen protest OR strike' },
  { cc: 'no', q: 'demonstrasjon OR streik', ed: ['no', 'NO', 'no'] },
  { cc: 'fi', q: 'mielenosoitus OR lakko', ed: ['fi', 'FI', 'fi'] },
  { cc: 'ie', q: 'protest OR strike OR rally', ed: ['en-IE', 'IE', 'en'] },
  { cc: 'cz', q: 'demonstrace OR protest OR stávka', ed: ['cs', 'CZ', 'cs'] },
  { cc: 'sk', q: 'protest OR štrajk', ed: ['sk', 'SK', 'sk'] },
  { cc: 'hu', q: 'tüntetés OR sztrájk', ed: ['hu', 'HU', 'hu'] },
  { cc: 'bg', q: 'протест OR стачка', ed: ['bg', 'BG', 'bg'] },
  { cc: 'hr', q: 'Croatia Zagreb protest OR strike' },
  { cc: 'si', q: 'protest OR stavka', ed: ['sl', 'SI', 'sl'] },
  { cc: 'rs', q: 'protest OR štrajk', ed: ['sr', 'RS', 'sr'] },
  { cc: 'ba', q: 'Bosnia Sarajevo protest OR strike' },
  { cc: 'me', q: 'Montenegro Podgorica protest' },
  { cc: 'mk', q: 'North Macedonia Skopje protest' },
  { cc: 'al', q: 'Albania Tirana protest' },
  { cc: 'md', q: 'Moldova Chisinau protest' },
  { cc: 'lt', q: 'protestas OR streikas', ed: ['lt', 'LT', 'lt'] },
  { cc: 'lv', q: 'protests OR streiks', ed: ['lv', 'LV', 'lv'] },
  { cc: 'ee', q: 'meeleavaldus OR streik', ed: ['et', 'EE', 'et'] },
  { cc: 'cy', q: 'Cyprus Nicosia protest OR strike' },
  { cc: 'ge', q: 'Georgia Tbilisi protest' },
  { cc: 'am', q: 'Armenia Yerevan protest' },
  { cc: 'az', q: 'Azerbaijan Baku protest' },
  { cc: 'ru', q: 'протест OR митинг OR забастовка', ed: ['ru', 'RU', 'ru'] },
  { cc: 'by', q: 'Belarus Minsk protest' },
  { cc: 'lu', q: 'Luxembourg manifestation OR grève OR protest', ed: ['fr', 'LU', 'fr'] },
  { cc: 'mt', q: 'Malta protest OR strike' },
  { cc: 'is', q: 'Iceland Reykjavik protest OR strike' },
];

const PER_BIG = 5;
const PER_SMALL = 3;
const SEARCH_HOURS = 36; // a story older than this has had its chance
const REMEMBER_DAYS = 4; // Google lists a story for days; decoding its link twice is wasted
// Governments, police and unions are parties to a protest, not newsrooms: never a source or a second newsroom.
const NOT_NEWSROOM = /.gouv.fr$|.gov(.[a-z]{2})?$|.gob.es$|.europa.eu$|^questure.|poliziadistato.it$|(^|.)(cgil|cisl|ugt|ccoo|cfdt|cgt|igmetall|dgb|verdi|unison|unitetheunion|cnduk|jw).[a-z.]+$|^metropole.|^chp.org.tr$/;

export interface SweepItem {
  link: string;
  src: string;
  title: string;
  publishedAt?: string;
}

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
/** A headline's words in any script, for spotting a story we already hold. */
export const titleKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function parseItems(xml: string): SweepItem[] {
  const out: SweepItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const src = m[1].match(/<source url="([^"]+)"/)?.[1];
    const pub = Date.parse(m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
    if (!link || !src) continue;
    out.push({
      link,
      src,
      title: unescape(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+-\s+[^-]+$/, ''),
      publishedAt: Number.isFinite(pub) ? new Date(pub).toISOString() : undefined,
    });
  }
  return out;
}

/** The fresh, on-topic items not seen before, one per publisher, before spending a decode on them. */
export function pickItems(items: SweepItem[], known: Set<string>, swept: Record<string, string>, n: number, now = Date.now()): SweepItem[] {
  const out: SweepItem[] = [];
  const publishers = new Set<string>();
  for (const i of items) {
    if (out.length >= n) break;
    if (swept[sha(i.link)] || known.has(titleKey(i.title))) continue;
    if (i.publishedAt && now - Date.parse(i.publishedAt) > SEARCH_HOURS * 3.6e6) continue;
    const pub = publisherOf(i.src);
    if (publishers.has(pub) || isBlockedUrl(i.src) || NOT_NEWSROOM.test(hostOf(i.src)) || !looksLikeProtest(i.title)) continue;
    publishers.add(pub);
    out.push(i);
  }
  return out;
}

/** Big countries first; the rest take turns at the front, so a short run still reaches them all over a day. */
export function sweepOrder(now = Date.now()): SweepQuery[] {
  const small = SWEEP.filter((s) => !s.big);
  const turn = Math.floor(now / (3 * 3.6e6)) % small.length;
  return [...SWEEP.filter((s) => s.big), ...small.slice(turn), ...small.slice(0, turn)];
}

export async function sweep(
  known: Set<string>,
  swept: Record<string, string>,
  log: (s: string) => void,
  opts: { max: number; budgetMs: number },
): Promise<{ url: string; title: string; publishedAt?: string }[]> {
  const t0 = Date.now();
  for (const [k, at] of Object.entries(swept)) if (t0 - Date.parse(at) > REMEMBER_DAYS * 864e5) delete swept[k];
  const leads: { url: string; title: string; publishedAt?: string }[] = [];
  let blocked = false;
  let searched = 0;
  const order = sweepOrder(t0);
  const picks: SweepItem[][] = order.map(() => []);
  await pool(order, 4, async (s, n) => {
    if (blocked || Date.now() - t0 > opts.budgetMs) return;
    const [hl, gl, lang] = s.ed ?? ['en-US', 'US', 'en'];
    try {
      const res = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`${s.q} when:1d`)}&hl=${hl}&gl=${gl}&ceid=${gl}:${lang}`);
      if (res.status === 429) throw new Blocked();
      searched++;
      picks[n] = pickItems(parseItems(await res.text()), known, swept, s.big ? PER_BIG : PER_SMALL, t0);
    } catch (err) {
      if (err instanceof Blocked) blocked = true;
      else log(`sweep ${s.cc}: ${(err as Error).message.slice(0, 80)}`);
    }
  });
  // One story from every country before a second from any: the limit must not go to France alone.
  const queue = Array.from({ length: PER_BIG }, (_, round) => picks.flatMap((p) => p[round] ?? [])).flat();
  await pool(queue, 3, async (i) => {
    if (blocked || leads.length >= opts.max || Date.now() - t0 > opts.budgetMs) return;
    swept[sha(i.link)] = new Date(t0).toISOString();
    try {
      const url = await decode(i.link);
      if (!url || publisherOf(url) !== publisherOf(i.src) || isBlockedUrl(url) || NOT_NEWSROOM.test(hostOf(url))) return;
      known.add(titleKey(i.title));
      leads.push({ url, title: i.title, publishedAt: i.publishedAt });
    } catch (err) {
      if (err instanceof Blocked) blocked = true;
    }
  });
  log(`sweep: ${searched} country searches, ${leads.length} new leads${blocked ? ' (rate-limited, stopped early)' : ''}`);
  return leads;
}
