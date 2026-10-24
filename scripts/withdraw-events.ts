// Take published events off the site for good (owner decision), without breaking links:
//   node scripts/withdraw-events.ts "<reason>" <id> [<id>...]
// The event stays in data/ (so new articles still match it instead of opening a twin),
// score.ts keeps it unpublished, and its URL — English and every language prefix —
// redirects permanently to its country page (vercel.json).
import fs from 'node:fs';
import { byIso, TRANSLATE_TO } from '../pipeline/config.ts';
import { loadEvents, saveEvents } from '../pipeline/store.ts';

const [reason, ...ids] = process.argv.slice(2);
if (!reason || !ids.length) throw new Error('usage: node scripts/withdraw-events.ts "<reason>" <id> [<id>...]');

const events = loadEvents();
const file = 'vercel.json';
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const langs = TRANSLATE_TO.map((l) => l.code).join('|');
let redirects = 0;
for (const id of ids) {
  const e = events.get(id);
  if (!e) throw new Error(`unknown event: ${id}`);
  e.withdrawn = reason;
  e.published = false;
  if (!e.slug) continue;
  const country = byIso.get(e.place.country)!.slug;
  for (const r of [
    { source: `/p/${e.slug}`, destination: `/country/${country}`, permanent: true },
    { source: `/:lang(${langs})/p/${e.slug}`, destination: `/:lang/country/${country}`, permanent: true },
  ]) {
    if (cfg.redirects.some((x: { source: string }) => x.source === r.source)) continue;
    cfg.redirects.push(r);
    redirects++;
  }
}
saveEvents(events);
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log(`withdrew ${ids.length} events, ${redirects} redirects added`);
