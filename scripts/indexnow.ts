// Tell Bing/Yandex/Seznam (IndexNow) which pages changed in this run. Google has no
// ping API; it reads the sitemaps (lastmod) instead.
import fs from 'node:fs';
import { INDEXNOW_KEY, SITE } from '../src/site.ts';

const { paths = [] } = (() => {
  try {
    return JSON.parse(fs.readFileSync('data/changed.json', 'utf8'));
  } catch {
    return {};
  }
})() as { paths?: string[] };
// Only ping URLs that exist in this build (city pages need >= 2 events).
const exists = (p: string) => p === '/' || fs.existsSync(`dist${p}.html`) || fs.existsSync(`dist${p}/index.html`);
const urls = paths.filter(exists).map((p) => SITE + (p === '/' ? '' : p));
if (!urls.length || SITE.includes('localhost')) {
  console.log('indexnow: nothing to send');
} else {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 10000) }),
  });
  console.log(`indexnow: ${urls.length} urls → HTTP ${res.status}`);
}
