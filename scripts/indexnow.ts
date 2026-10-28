// Tell Bing/Yandex/Seznam (IndexNow) which pages changed in this run. Google has no
// ping API; it reads the sitemaps (lastmod) instead.
// Runs at the end of `npm run build` on Cloudflare Workers Builds, where dist/ exists, so
// only pages that this build actually made are sent (the pipeline workflow never builds).
// It never fails the build.
import fs from 'node:fs';
import { INDEXNOW_KEY, SITE } from '../src/site.ts';

const { at, paths = [] } = (() => {
  try {
    return JSON.parse(fs.readFileSync('data/changed.json', 'utf8'));
  } catch {
    return {};
  }
})() as { at?: string; paths?: string[] };
// Only ping URLs that exist in this build (city pages need >= 2 events).
const exists = (p: string) => p === '/' || fs.existsSync(`dist${p}.html`) || fs.existsSync(`dist${p}/index.html`);
const urls = paths.filter(exists).map((p) => SITE + (p === '/' ? '' : p));
// A code push rebuilds with the last run's list; only a fresh pipeline commit pings.
const fresh = !!at && Date.now() - Date.parse(at) < 30 * 60e3;
const branch = process.env.WORKERS_CI_BRANCH;
if (!process.env.WORKERS_CI || (branch && branch !== 'main')) {
  console.log('indexnow: not a production Workers build, skipped');
} else if (!urls.length || !fresh || SITE.includes('localhost')) {
  console.log(`indexnow: nothing to send (${urls.length} urls, list from ${at ?? 'never'})`);
} else {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 10000) }),
      signal: AbortSignal.timeout(20e3),
    });
    console.log(`indexnow: ${urls.length} of ${paths.length} urls → HTTP ${res.status}`);
  } catch (err) {
    console.log(`indexnow: failed (${(err as Error).message})`);
  }
}
