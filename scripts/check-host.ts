// Compares how a host answers against the Vercel baseline taken on 27 Oct 2026 (before the
// Cloudflare move), plus every page in the current build's sitemaps. Search rankings depend
// on these answers staying the same: status, redirect target, page type, canonical, noindex.
//   node scripts/check-host.ts <base> [baseline urls.json]
// e.g. node scripts/check-host.ts https://protesttracker.swapnil-8723.workers.dev
// Exit code 1 if anything differs. A POST check of the form is opt-in (CHECK_FORM=1) because
// it writes test reports, which must be deleted before the pipeline next runs.
import fs from 'node:fs';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
const baselineFile = process.argv[3] ?? '../GSC/cloudflare-baseline/vercel-2026-10-27/urls.json';
if (!base) throw new Error('usage: node scripts/check-host.ts <base> [baseline urls.json]');

interface Row { path: string; status?: number; location?: string | null; type?: string | null; cache?: string | null; canonical?: string | null; noindex?: boolean; hreflangs?: number; error?: string }
const baseline: { results: Row[] } = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
// The sitemaps as the host serves them (what search engines read), not a local build.
const built = new Set<string>();
const sitemapFiles = ['/news-sitemap.xml', ...locs(await (await fetch(base + '/sitemap-index.xml')).text())];
for (const s of sitemapFiles) {
  const res = await fetch(base + s);
  if (res.status !== 200) throw new Error(`${s}: ${res.status}`);
  for (const p of locs(await res.text())) built.add(p);
}

async function probe(path: string): Promise<Row> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'loud-migration-check' } });
      const h = (k: string) => res.headers.get(k);
      const row: Row = { path, status: res.status, location: h('location'), type: h('content-type'), cache: h('cache-control') };
      if (res.status === 200 && (h('content-type') ?? '').includes('html')) {
        const html = await res.text();
        row.canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? null;
        row.noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
        row.hreflangs = (html.match(/hreflang="/g) ?? []).length;
      } else await res.arrayBuffer().catch(() => {});
      return row;
    } catch (e) {
      if (i === 2) return { path, error: (e as Error).message };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const paths = [...new Set([...baseline.results.map((r) => r.path), ...built])];
const got = new Map<string, Row>();
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < paths.length) {
    const p = paths[next++];
    got.set(p, await probe(p));
  }
}));

const fails: string[] = [];
const notes: string[] = [];
const loc = (l?: string | null) => (l ? new URL(l, 'https://protesttracker.online').pathname : null);
const family = (t?: string | null) => (t ?? '').split(';')[0].trim();
const permanent = (s?: number) => s === 301 || s === 308;

for (const want of baseline.results) {
  const g = got.get(want.path)!;
  if (g.error) { fails.push(`${want.path}: ${g.error}`); continue; }
  // Pages that left (or joined) the sitemaps since the baseline are the pipeline's normal work.
  if (want.status === 200 && g.status !== 200 && !built.has(want.path) && want.type?.includes('html')) { notes.push(`${want.path}: ${want.status} → ${g.status} (no longer in this build's sitemaps)`); continue; }
  if (want.status !== g.status) {
    if (permanent(want.status) && permanent(g.status) && loc(want.location) === loc(g.location)) notes.push(`${want.path}: ${want.status} → ${g.status} (both permanent, same target)`);
    else fails.push(`${want.path}: status ${want.status} → ${g.status}${g.location ? ` (→ ${g.location})` : ''}`);
    continue;
  }
  if (want.location && loc(want.location) !== loc(g.location)) fails.push(`${want.path}: redirect ${loc(want.location)} → ${loc(g.location)}`);
  if (want.status === 200 && family(want.type) !== family(g.type)) fails.push(`${want.path}: type ${family(want.type)} → ${family(g.type)}`);
  if (want.canonical && want.canonical !== g.canonical) fails.push(`${want.path}: canonical ${want.canonical} → ${g.canonical}`);
  if (want.noindex !== undefined && want.noindex !== g.noindex) fails.push(`${want.path}: noindex ${want.noindex} → ${g.noindex}`);
  if (want.cache && want.cache !== g.cache && !want.cache.includes('max-age=0')) fails.push(`${want.path}: cache-control "${want.cache}" → "${g.cache}"`);
}
for (const p of built) {
  const g = got.get(p)!;
  if (g.status !== 200) fails.push(`${p} (in sitemap): ${g.error ?? g.status}`);
  else if (g.canonical !== 'https://protesttracker.online' + (p === '/' ? '' : p)) fails.push(`${p} (in sitemap): canonical ${g.canonical}`);
  else if (g.noindex) fails.push(`${p} (in sitemap): noindex`);
}

// Files that must not be public, and response headers search engines and browsers see.
for (const p of ['/_redirects', '/_headers']) { const r = await probe(p); if (r.status !== 404) fails.push(`${p} is public (${r.status})`); }
const home = await fetch(base + '/');
for (const [k, v] of [['strict-transport-security', 'max-age=63072000'], ['x-content-type-options', 'nosniff'], ['referrer-policy', 'strict-origin-when-cross-origin']]) {
  if (home.headers.get(k) !== v) fails.push(`/ header ${k}: ${home.headers.get(k)} (want ${v})`);
}
// Text files with non-ASCII characters need an explicit charset (Vercel sends one).
for (const p of ['/robots.txt', '/llms.txt']) {
  const r = await probe(p);
  if (r.type !== 'text/plain; charset=utf-8') fails.push(`${p}: content-type "${r.type}" (want "text/plain; charset=utf-8")`);
}
const homeHtml = await home.text();
const font = /href="(\/fonts\/[^"]+\.woff2)"/.exec(homeHtml)?.[1];
const astro = /(?:src|href)="(\/_astro\/[^"]+)"/.exec(homeHtml)?.[1];
if (!font || !astro) fails.push(`/ has no /fonts/ or /_astro/ file to check (${font}, ${astro})`);
for (const [p, cc] of [[font, 'public, max-age=31536000, immutable'], [astro, 'public, max-age=31536000, immutable']]) {
  if (!p) continue;
  const r = await probe(p);
  if (r.status !== 200 || r.cache !== cc) fails.push(`${p}: ${r.status} cache "${r.cache}" (want "${cc}")`);
}

if (process.env.CHECK_FORM === '1') {
  const today = new Date().toISOString().slice(0, 10);
  const send = (b: object) => fetch(base + '/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const form = { title: 'TEST-MIGRATION check, please ignore', city: 'Pune', region: 'Maharashtra', country: 'in', startedOn: today, stillOn: 'yes', why: 'TEST-MIGRATION: automated check of the reader form.', want: '', organisers: '', link: '', website: '', ms: 9000 };
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await send(form)).status);
  const bad = await send({ ...form, why: 'x' });
  const badBody = await bad.json().catch(() => ({}));
  if (codes.join() !== '200,200,200,429') notes.push(`form: ${codes.join()} (want 200,200,200,429; earlier test reports from this IP count too)`);
  if (bad.status !== 400 || badBody.code !== 'why') fails.push(`form: bad report → ${bad.status} ${badBody.code}`);
  console.log('FORM TEST WROTE REPORTS: delete them now (CLOUDFLARE-PLAN.md step 3.2)');
}

console.log(`checked ${got.size} URLs on ${base} against ${baselineFile} (${built.size} pages in its ${sitemapFiles.length} sitemaps)`);
if (notes.length) console.log(`notes (${notes.length}):\n  ` + notes.slice(0, 40).join('\n  '));
if (fails.length) {
  console.log(`FAIL ${fails.length}:\n  ` + fails.slice(0, 80).join('\n  '));
  process.exit(1);
}
console.log('PASS');
