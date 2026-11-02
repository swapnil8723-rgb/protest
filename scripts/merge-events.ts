// Fold a duplicate event into the one that keeps its page:
//   node scripts/merge-events.ts <keepId> <dropId>
// The duplicate's articles move to the kept event (the next pipeline run re-summarises it
// from all of them), the duplicate is hidden for good (score.ts), and its URL — English and
// every language prefix — redirects permanently to the kept page (vercel.json). Slugs never
// change, so the old link keeps working.
import fs from 'node:fs';
import { TRANSLATE_TO } from '../pipeline/config.ts';
import { mergeInto } from '../pipeline/events.ts';
import { loadArticles, loadEvents, saveArticles, saveEvents } from '../pipeline/store.ts';

const [keepId, dropId] = process.argv.slice(2);
if (!keepId || !dropId || keepId === dropId) throw new Error('usage: node scripts/merge-events.ts <keepId> <dropId>');

const events = loadEvents();
const articles = loadArticles();
const keep = events.get(keepId);
const drop = events.get(dropId);
if (!keep || !drop) throw new Error(`unknown event: ${!keep ? keepId : dropId}`);
if (keep.mergedInto) throw new Error(`${keepId} is itself merged into ${keep.mergedInto}`);
// A one-source candidate never had a page, so it may join a nationwide story pinned elsewhere
// (Gen Z demos announced city by city, Oct 2026); a published duplicate must be in the same city.
if (drop.slug && (keep.place.country !== drop.place.country || keep.place.citySlug !== drop.place.citySlug)) {
  throw new Error('events are in different cities (one page per city)');
}

const moved = mergeInto(keep, drop, events, articles);
saveEvents(events);
saveArticles(articles, events);

let redirects = 0;
if (drop.slug && keep.slug && drop.slug !== keep.slug) {
  const file = 'vercel.json';
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const langs = TRANSLATE_TO.map((l) => l.code).join('|');
  const add = [
    { source: `/p/${drop.slug}`, destination: `/p/${keep.slug}`, permanent: true },
    { source: `/:lang(${langs})/p/${drop.slug}`, destination: `/:lang/p/${keep.slug}`, permanent: true },
  ];
  for (const r of add) {
    if (cfg.redirects.some((x: { source: string }) => x.source === r.source)) continue;
    cfg.redirects.push(r);
    redirects++;
  }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

console.log(`merged ${dropId} (${drop.slug}) into ${keepId} (${keep.slug}): ${moved} articles moved, ${redirects} redirects added`);
