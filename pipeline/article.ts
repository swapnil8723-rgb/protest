// Fetch a news page once and pull out what the AI needs to judge and summarise it.
// The body text lives only in memory (or the local dev cache, PAGE_CACHE_DIR) — never in the data branch.
import fs from 'node:fs';
import path from 'node:path';
import { decode } from './rss.ts';
import { sha } from './util.ts';

export interface Page {
  finalUrl: string;
  title: string;
  description: string;
  publishedAt?: string;
  lang?: string;
  text: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const JUNK = /subscribe|newsletter|cookie|all rights reserved|copyright|sign up|log ?in|download (the )?app|follow us|also read|read more|click here|advertisement|whatsapp channel|recommended for you|e-?paper/i;

const memo = new Map<string, Promise<Page>>();

export function fetchPage(url: string): Promise<Page> {
  let p = memo.get(url);
  if (!p) {
    // Hard deadline on top of the fetch's own abort signal: when undici's parser
    // trips an internal assertion the request promise can be left unsettled.
    let timer: NodeJS.Timeout | undefined;
    p = Promise.race([
      load(url),
      new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error('deadline')), 25000))),
    ]).finally(() => clearTimeout(timer));
    memo.set(url, p);
  }
  return p;
}

// Optional local cache (PAGE_CACHE_DIR) for development and seeding only. CI never
// sets it, so article text is never persisted anywhere public.
const cacheDir = process.env.PAGE_CACHE_DIR;

async function load(url: string): Promise<Page> {
  const file = cacheDir ? path.join(cacheDir, `${sha(url, 20)}.json`) : '';
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const page = await download(url);
  if (file) {
    fs.mkdirSync(cacheDir!, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(page));
  }
  return page;
}

async function download(url: string): Promise<Page> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en;q=0.9,*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/html/i.test(type)) throw new Error(`not html (${type.split(';')[0]})`);
  const html = (await res.text()).slice(0, 2_000_000);
  return { finalUrl: res.url || url, ...extract(html) };
}

const meta = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : '';
};

export function extract(html: string): Omit<Page, 'finalUrl'> {
  const lang = html.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/i)?.[1]?.toLowerCase();
  const ld: any[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const walk = (x: any) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object') {
          ld.push(x);
          if (x['@graph']) walk(x['@graph']);
        }
      };
      walk(j);
    } catch {
      /* malformed JSON-LD is common */
    }
  }
  const art = ld.find((x) => /Article|Report|BlogPosting/i.test(String(x['@type'])));
  const title = meta(html, 'og:title') || art?.headline || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = meta(html, 'og:description') || meta(html, 'description') || art?.description || '';
  const published =
    meta(html, 'article:published_time') || art?.datePublished || meta(html, 'datePublished') ||
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || '';
  const t = published ? Date.parse(published) : NaN;

  let text = typeof art?.articleBody === 'string' ? decode(art.articleBody) : '';
  if (text.length < 400) {
    const body = html
      .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ');
    const scope = body.match(/<article[\s>][\s\S]*<\/article>/i)?.[0] ?? body;
    const paras = [...scope.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)]
      .map((m) => decode(m[0]))
      .filter((p) => p.length > 50 && !JUNK.test(p));
    const joined = [...new Set(paras)].join('\n');
    if (joined.length > text.length) text = joined;
  }
  return {
    title: decode(String(title)).slice(0, 300),
    description: decode(String(description)).slice(0, 500),
    publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    lang,
    text: text.slice(0, 6000),
  };
}
