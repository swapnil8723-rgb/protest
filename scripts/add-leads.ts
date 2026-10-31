// Hand the pipeline article links the owner found (a story the feeds missed):
//   node scripts/add-leads.ts <url> [<url>...]
// They are leads only, like the second-newsroom search: the next run fetches, classifies,
// geocodes, matches and summarises them, and score.ts decides whether anything is shown
// (≥ 2 independent publishers, review gates). The one difference: an owner lead skips the
// 12-day article-age gate, so an older story can still get its archive page.
import { loadArticles, loadEvents, saveArticles } from '../pipeline/store.ts';
import { hostOf, isBlockedUrl, nowIso } from '../pipeline/util.ts';

const urls = process.argv.slice(2);
if (!urls.length) throw new Error('usage: node scripts/add-leads.ts <url> [<url>...]');

const articles = loadArticles();
let added = 0;
for (const raw of urls) {
  const url = new URL(raw).toString();
  if (isBlockedUrl(url)) {
    console.log(`blocked publisher, skipped: ${url}`);
    continue;
  }
  if (articles.has(url)) {
    console.log(`already held: ${url}`);
    continue;
  }
  articles.set(url, { url, publisher: hostOf(url), via: 'owner', firstSeenAt: nowIso(), fetch: 'new' });
  added++;
}
saveArticles(articles, loadEvents());
console.log(`added ${added} leads; the next pipeline run reads them`);
