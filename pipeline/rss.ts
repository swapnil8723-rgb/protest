// Publisher RSS fills gaps GDELT misses: Indian city news, and the French/German/Spanish
// press that GDELT's English-only export never sees. Items only enter the pipeline if
// their headline/summary uses protest vocabulary. Only feeds whose articles we can fetch
// (Le Monde 402, Libération 403, NYT 403 were tried and dropped, Oct 2026).
import { isBlockedUrl, PROTEST_WORDS } from './util.ts';

export const FEEDS = [
  // India
  'https://www.thehindu.com/news/national/feeder/default.rss',
  'https://www.thehindu.com/news/cities/feeder/default.rss',
  'https://indianexpress.com/section/india/feed/',
  'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
  'https://feeds.feedburner.com/ndtvnews-india-news',
  'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms',
  'https://theprint.in/category/india/feed/',
  // France
  'https://www.francetvinfo.fr/titres.rss',
  'https://www.france24.com/fr/france/rss',
  'https://www.france24.com/en/france/rss',
  'https://www.20minutes.fr/feeds/rss-une.xml',
  'https://www.lefigaro.fr/rss/figaro_actualites.xml',
  'https://www.ouest-france.fr/rss/une',
  'https://www.theguardian.com/world/france/rss',
  // Germany
  'https://www.tagesschau.de/inland/index~rss2.xml',
  'https://www.spiegel.de/schlagzeilen/index.rss',
  'https://rss.dw.com/rdf/rss-en-ger',
  'https://www.theguardian.com/world/germany/rss',
  // Spain, UK, US
  'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
  'https://www.theguardian.com/world/spain/rss',
  'https://www.theguardian.com/uk-news/rss',
  'https://www.theguardian.com/us-news/rss',
  'https://feeds.npr.org/1003/rss.xml',
];

export interface RssItem {
  url: string;
  title: string;
  description: string;
  publishedAt?: string;
}

const UA = 'Mozilla/5.0 (compatible; LOUDProtestTracker/1.0; +https://protesttracker.online/how-we-know)';

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…', rsquor: '’', laquo: '«', raquo: '»', middot: '·', bull: '•', euro: '€', pound: '£', rupee: '₹',
};
const entities = (s: string) =>
  s
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

export const decode = (s: string) =>
  entities(entities(s // twice: feeds often double-escape ("&amp;nbsp;")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();

export function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const block = m[0];
    const tag = (t: string) => block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? '';
    const url = decode(tag('link')) || decode(tag('guid'));
    if (!/^https?:\/\//.test(url)) continue;
    const pub = tag('pubDate');
    const t = pub ? Date.parse(decode(pub)) : NaN;
    items.push({
      url,
      title: decode(tag('title')),
      description: decode(tag('description')).slice(0, 400),
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    });
  }
  return items;
}

export async function discoverRss(log: (s: string) => void, maxAgeHours = 72): Promise<RssItem[]> {
  const out: RssItem[] = [];
  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(String(res.status));
        const items = parseFeed(await res.text()).filter(
          (i) =>
            PROTEST_WORDS.test(`${i.title} ${i.description}`) &&
            !isBlockedUrl(i.url) &&
            (!i.publishedAt || Date.now() - Date.parse(i.publishedAt) < maxAgeHours * 3.6e6),
        );
        out.push(...items);
      } catch (e) {
        log(`rss ${new URL(f).hostname}: ${(e as Error).message}`);
      }
    }),
  );
  return out;
}
