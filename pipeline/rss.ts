// Publisher RSS fills gaps GDELT misses: Indian city news, the European press that
// GDELT's English-only export never sees, and Ukraine/Russia outlets. Items only enter the pipeline if
// their headline/summary uses protest vocabulary. Only feeds whose articles we can fetch
// (Le Monde 402, Libération 403, NYT 403 were tried and dropped, Oct 2026).
import { isBlockedUrl, looksLikeProtest } from './util.ts';

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
  // Rest of Europe (Pravda.com.ua, Kathimerini, Romania Insider, Euronews refuse us; dropped)
  'https://www.theguardian.com/world/europe-news/rss',
  'https://www.theguardian.com/world/italy/rss',
  'https://www.ansa.it/english/news/english_nr_rss.xml',
  'https://www.theguardian.com/world/netherlands/rss',
  'https://www.theguardian.com/world/greece/rss',
  'https://www.theguardian.com/world/poland/rss',
  'https://notesfrompoland.com/feed/',
  'https://www.theguardian.com/world/serbia/rss',
  'https://balkaninsight.com/feed/',
  'https://www.theguardian.com/world/turkey/rss',
  'https://bianet.org/english/rss',
  'https://civil.ge/feed',
  'https://www.rte.ie/feeds/rss/?index=/news/',
  'https://www.thelocal.se/feeds/rss.php',
  // Ukraine and Russia (war "strikes" are filtered out by looksLikeProtest)
  'https://www.theguardian.com/world/ukraine/rss',
  'https://www.theguardian.com/world/russia/rss',
  'https://kyivindependent.com/news-archive/rss/',
  'https://meduza.io/rss/en/all',
  'https://www.themoscowtimes.com/rss/news',
  // Nordics, Baltics, Caucasus (ERR, Yle, LRT; OC Media covers Georgia/Armenia/Azerbaijan)
  'https://news.err.ee/rss',
  'https://yle.fi/rss/t/18-34837/en',
  'https://www.lrt.lt/en/news-in-english?rss',
  'https://oc-media.org/feed/',
  'https://www.theguardian.com/world/slovakia/rss',
  'https://www.theguardian.com/world/bulgaria/rss',
  // More US national newsrooms, so a protest one local outlet reports can find its second source
  // (The Hill, Axios, CNN's dead feed and the Washington Post refuse us or are stale; dropped)
  'https://www.cbsnews.com/latest/rss/us',
  'https://abcnews.go.com/abcnews/usheadlines',
  'https://feeds.nbcnews.com/nbcnews/public/news',
  'https://moxie.foxnews.com/google-publisher/us.xml',
  'https://www.latimes.com/california/rss2.0.xml',
  // Canada
  'https://globalnews.ca/canada/feed/',
  'https://www.theguardian.com/world/canada/rss',
  // Middle East & North Africa: Israeli, Arab and international newsrooms side by side
  // (Times of Israel, IranWire, Al Arabiya, Morocco World News refuse us; JPost's feed is stale)
  'https://www.theguardian.com/world/middleeast/rss',
  'https://www.theguardian.com/world/israel/rss',
  'https://www.theguardian.com/world/palestinian-territories/rss',
  'https://www.theguardian.com/world/iran/rss',
  'https://www.theguardian.com/world/lebanon/rss',
  'https://www.theguardian.com/world/iraq/rss',
  'https://www.theguardian.com/world/egypt/rss',
  'https://www.theguardian.com/world/morocco/rss',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://www.ynetnews.com/Integration/StoryRss3089.xml',
  'https://www.haaretz.com/srv/haaretz-latest-headlines',
  'https://www.iranintl.com/en/feed',
  'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml',
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
            looksLikeProtest(`${i.title} ${i.description}`) &&
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
