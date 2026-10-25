import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export const nowIso = () => new Date().toISOString();
export const sha = (s: string, n = 12) => createHash('sha256').update(s).digest('hex').slice(0, n);
export const hoursSince = (iso: string | undefined, now = Date.now()) =>
  iso ? (now - Date.parse(iso)) / 3.6e6 : Infinity;

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Lowercase, accent-free, punctuation-free — for name matching. */
export function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Second-level suffixes where the registrable domain has three labels.
const SLD = new Set(['co.uk', 'org.uk', 'ac.uk', 'co.in', 'org.in', 'net.in', 'gov.in', 'com.pk', 'com.bd', 'co.ke',
  'or.ke', 'co.id', 'or.id', 'com.np', 'org.np', 'com.au', 'co.nz', 'com.br', 'co.za', 'com.sg', 'com.my',
  // Europe & Middle East (Oct 2026): without these, every Turkish or Israeli outlet counted as one publisher
  'com.tr', 'org.tr', 'gen.tr', 'co.il', 'org.il', 'com.ua', 'org.ua', 'com.eg', 'co.ma', 'com.lb', 'com.jo',
  'com.iq', 'co.ir', 'com.tn', 'com.cy', 'com.mk', 'co.rs', 'org.rs', 'com.pl', 'com.ge', 'com.mt', 'co.at', 'or.at']);

/** Ownership group for counting *independent* publishers: sister titles collapse
 *  ("economictimes.indiatimes.com" and "timesofindia.indiatimes.com" → "indiatimes.com"). */
export function publisherOf(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  return SLD.has(last2) ? parts.slice(-3).join('.') : last2;
}

// Syndication farms and aggregators re-post wire copy; they would fake corroboration.
const BLOCKED_PUBLISHERS = new Set([
  'freerepublic.com', 'netscape.com', 'aol.com', 'aol.co.uk', 'msn.com', 'yahoo.com', 'newsbreak.com',
  'headtopics.com', 'flipboard.com', 'ground.news', 'newsnow.co.uk', 'dailyhunt.in', 'inshorts.com',
  'devdiscourse.com', 'latestly.com', 'menafn.com', 'whatsnew2day.com', 'newsbeezer.com', 'wn.com', 'newsnow.com',
  'youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'reddit.com', 'tiktok.com',
  'wikipedia.org', 'blogspot.com', 'wordpress.com', 'medium.com', 'substack.com', 'wenxuecity.com',
  // personal blogs that re-post others' reporting (not newsrooms)
  'voiceofvienna.org', 'rightspeak.net', 'yourdemocracy.net',
  // re-post wire copy under their own headline (seen in second-newsroom search results)
  'marketscreener.com', 'globalbankingandfinance.com', 'newscord.org', 'breakingbelizenews.com',
]);

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|amp|mobile)\./, '');
  } catch {
    return '';
  }
}

export function isBlockedUrl(url: string): boolean {
  const pub = publisherOf(url);
  if (!pub || BLOCKED_PUBLISHERS.has(pub)) return true;
  // Big News Network: hundreds of look-alike domains, path /news/2xxxxxxxx/slug
  if (/\/news\/2\d{8}\//.test(url)) return true;
  // Live blogs, video and photo pages rarely describe one protest
  if (/\/(video|videos|photos|gallery|live-blog|liveblog|podcast)s?\//i.test(url)) return true;
  return false;
}

/** Token-set Jaccard on titles; ≥ 0.6 means "same wire story re-published". */
export function titleSimilarity(a: string, b: string): number {
  const stop = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'for', 'and', 'at', 'as', 'with', 'by', 'over', 'after', 'amid']);
  const toks = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !stop.has(w)));
  const A = toks(a);
  const B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Extract the single file from a GDELT zip (handles data-descriptor zips). */
export function unzipFirst(buf: Buffer): Buffer {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: no end of central directory');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('zip: bad central directory');
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const start = local + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip: unsupported method ${method}`);
}

/** Run fn over items with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dayIn(tz: string, at: number | Date = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

/** Words that mark a story as possibly about a protest — a cheap gate before any AI call.
 *  Deliberately broad and multilingual; the classify step does the real judging. */
export const PROTEST_WORDS = new RegExp(
  [
    'protest', 'demonstrat', 'rally', 'rallies', 'march(?:ed|es|ers)?\\b', 'strike', 'walkout', 'walk-out', 'sit-in',
    'dharna', 'agitat', 'bandh', 'hartal', 'gherao', 'blockade', 'block(?:ed|ing)? (?:road|highway|rail)', 'picket',
    'hunger strike', 'boycott', 'riot', 'unrest', 'clash', 'stir\\b', 'andolan', 'morcha', 'chakka jam', 'rail roko',
    'rasta roko', 'candle(?:light)? march', 'shutdown', 'occupy', 'encampment', 'vigil', 'uprising',
    // fr / es / de / id
    'manifest', 'grève', 'greve', 'mobilisation', 'huelga', 'protesta', 'concentraci', 'kundgebung', 'streik',
    'demo\\b', 'unjuk rasa', 'demonstrasi', 'aksi massa', 'mogok',
  ].join('|'),
  'i',
);

/** "Strike" in war news ("drone strike on Kyiv", "airstrikes") is not a walkout. Removed
 *  before the protest-word test so Ukraine/Russia war coverage doesn't flood the AI step. */
const WAR_STRIKES = /\b(?:drone|missile|air|aerial|artillery|rocket|military|retaliatory|precision|nuclear|deadly|overnight|russian|ukrainian|israeli|ballistic|cruise)[ -]strikes?\b|\bair-?strikes?\b/gi;

export const looksLikeProtest = (text: string) => PROTEST_WORDS.test(text.replace(WAR_STRIKES, ' '));
