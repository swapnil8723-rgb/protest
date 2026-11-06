// The Cloudflare Worker (worker/): the form → D1 inbox → pipeline round trip on a real
// SQLite database built from migrations/, the pipeline backup, and the _redirects file
// generated from vercel.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.ts';
import * as inbox from '../worker/inbox.ts';
import { tick } from '../worker/tick.ts';
import type { D1Database, D1PreparedStatement, Env } from '../worker/types.ts';
import { toCloudflareRedirects } from '../scripts/redirects.ts';

/** D1's API over node:sqlite, with the real schema. */
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync('migrations').sort()) db.exec(fs.readFileSync(`migrations/${f}`, 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...a) => stmt(sql, a),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as any[])) as T[] }),
    run: async () => db.prepare(sql).run(...(args as any[])),
  });
  return { prepare: (sql) => stmt(sql), batch: async (s) => Promise.all(s.map((x) => x.run())) };
}

const env = (): Env => ({
  ASSETS: { fetch: async (r) => new Response(`asset ${new URL(r.url).pathname}`, { status: 404 }) },
  INBOX: fakeD1(),
  READER_SALT: 'salt',
});
const today = new Date().toISOString().slice(0, 10);
const form = {
  title: 'Students protest fee hike at Savitribai Phule Pune University', city: 'Pune', region: 'Maharashtra', country: 'in',
  startedOn: today, stillOn: 'yes', why: 'The university raised hostel and exam fees by a third this term.', want: 'Roll back the fee hike.',
  organisers: 'Students Federation', link: '', website: '', ms: 30000,
};
const post = (e: Env, body: unknown, ip = '203.0.113.7') =>
  worker.fetch(new Request('https://x/api/report', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), e);

test('worker: form reports land in D1, 3 per person per day, same answers as Vercel', async () => {
  const e = env();
  for (let i = 0; i < 3; i++) assert.equal((await post(e, form)).status, 200);
  const fourth = await post(e, form);
  assert.equal(fourth.status, 429);
  assert.equal((await fourth.json()).code, 'limit');
  assert.equal((await post(e, form, '198.51.100.1')).status, 200); // someone else
  const bad = await post(e, { ...form, why: 'fees' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'why');
  const notJson = await worker.fetch(new Request('https://x/api/report', { method: 'POST', body: 'x' }), e);
  assert.equal(notJson.status, 415);
  assert.equal((await worker.fetch(new Request('https://x/api/report'), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://x/api/report', { method: 'PUT' }), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://x/api/nope'), e)).status, 404); // the site's 404 page
});

test('worker: inbox lists and deletes in the shape pipeline/reader.ts expects, and only for GitHub', async () => {
  const e = env();
  await post(e, form);
  await post(e, { ...form, city: 'Mumbai' });
  const ok = async () => true;
  const auth = { authorization: 'Bearer t' };

  assert.equal((await worker.fetch(new Request('https://x/api/inbox'), e)).status, 401); // no token
  assert.equal((await worker.fetch(new Request('https://x/api/inbox', { headers: auth }), e)).status, 401); // a bad token
  assert.equal((await worker.fetch(new Request('https://x/api/inbox', { method: 'DELETE', headers: auth }), e)).status, 401);

  const list = await inbox.GET(new Request('https://x/api/inbox', { headers: auth }), e, ok);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  const { items } = await list.json();
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.match(it.id, new RegExp(`^queue/${today}/[0-9a-f]{16}-[12]\\.json$`));
    assert.ok(!Number.isNaN(Date.parse(it.at)));
    assert.equal(typeof it.data.submittedAt, 'string');
    assert.equal(it.data.country, 'in');
    assert.ok(!JSON.stringify(it).includes('203.0.113.7')); // the IP is never stored
  }
  const del = await inbox.DELETE(new Request('https://x/api/inbox', { method: 'DELETE', headers: auth, body: JSON.stringify({ pathnames: [items[0].id, 'not-queue/x', 5] }) }), e, ok);
  assert.deepEqual(await del.json(), { deleted: 1 });
  const after = await (await inbox.GET(new Request('https://x/api/inbox', { headers: auth }), e, ok)).json();
  assert.deepEqual(after.items.map((i: any) => i.id), [items[1].id]);
  // a handled report frees its slot, as with the Blob version
  assert.equal((await post(e, form)).status, 200);
});

test('worker: deleting more than 100 reports at once works (D1 binds 100 values per statement)', async () => {
  const e = env();
  const ids = Array.from({ length: 150 }, (_, i) => `queue/${today}/${String(i).padStart(16, '0')}-1.json`);
  await e.INBOX.batch(ids.map((id, i) => e.INBOX.prepare('INSERT INTO reports (id, day, who, n, at, data) VALUES (?, ?, ?, 1, ?, ?)').bind(id, today, String(i), new Date().toISOString(), '{}')));
  const del = await inbox.DELETE(new Request('https://x/api/inbox', { method: 'DELETE', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ pathnames: ids }) }), e, async () => true);
  assert.deepEqual(await del.json(), { deleted: 150 });
  const left = await e.INBOX.prepare('SELECT COUNT(*) AS n FROM reports').all<{ n: number }>();
  assert.equal(left.results[0].n, 0);
});

test('worker: the hourly backup starts the pipeline only after 225 quiet minutes', async () => {
  const NOW = Date.parse('2026-10-28T10:50:00Z');
  const calls: string[] = [];
  const github = (...list: object[]) => (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url).split('/workflows/')[1]}`);
    if (String(url).endsWith('/dispatches')) return new Response(null, { status: 204 });
    return Response.json({ workflow_runs: list });
  }) as typeof fetch;
  const e = { ...env(), GITHUB_DISPATCH_TOKEN: 'gh' };

  assert.deepEqual(await tick({ ...e, GITHUB_DISPATCH_TOKEN: undefined }, NOW, github()), { skipped: 'GITHUB_DISPATCH_TOKEN not set' });
  assert.equal(((await tick(e, NOW, github({ created_at: '2026-10-28T09:00:00Z', status: 'completed' }))) as any).skipped, 'recent run');
  assert.equal(((await tick(e, NOW, github({ created_at: '2026-10-28T07:30:00Z', status: 'completed' }))) as any).skipped, 'recent run'); // 200 min: inside the 4-hour cadence
  assert.equal(((await tick(e, NOW, github({ created_at: '2026-10-28T05:00:00Z', status: 'in_progress' }))) as any).skipped, 'recent run');
  calls.length = 0;
  assert.equal(((await tick(e, NOW, github({ created_at: '2026-10-28T06:50:00Z', status: 'completed' }))) as any).dispatched, true);
  assert.deepEqual(calls, ['GET pipeline.yml/runs?per_page=10', 'POST pipeline.yml/dispatches']);

  // A scheduled run that skipped itself doesn't reset the clock; the real run before it counts.
  const skipped = { event: 'schedule', status: 'completed', created_at: '2026-10-28T09:30:00Z', updated_at: '2026-10-28T09:30:40Z' };
  const real = { event: 'workflow_dispatch', status: 'completed', created_at: '2026-10-28T06:50:00Z', updated_at: '2026-10-28T07:00:00Z' };
  assert.equal(((await tick(e, NOW, github(skipped, real))) as any).dispatched, true);
  // A scheduled run that really ran does count, and so does one still going.
  assert.equal(((await tick(e, NOW, github({ ...skipped, updated_at: '2026-10-28T09:40:00Z' }, real))) as any).skipped, 'recent run');
  assert.equal(((await tick(e, NOW, github({ ...skipped, status: 'in_progress' }, real))) as any).skipped, 'recent run');
});

test('worker: the ad counter keeps totals only, and only from our own pages', async () => {
  const e = env();
  const send = (q: string, origin = 'https://x', method = 'POST', cf?: { country: string }) => {
    const r = new Request(`https://x/api/promo${q}`, { method, headers: { origin } });
    if (cf) Object.defineProperty(r, 'cf', { value: cf });
    return worker.fetch(r, e);
  };
  assert.equal((await send('?e=click', 'https://x', 'POST', { country: 'FR' })).status, 204);
  assert.equal((await send('?e=click', 'https://x', 'POST', { country: 'FR' })).status, 204);
  assert.equal((await send('?e=close', 'https://x', 'POST', { country: 'DE' })).status, 204);
  assert.equal((await send('?e=click')).status, 204); // no country: still counted
  assert.equal((await send('?e=click', 'https://elsewhere.example')).status, 400);
  assert.equal((await send('?e=view')).status, 400);
  assert.equal((await send('?e=click', 'https://x', 'GET')).status, 405);
  const { results } = await e.INBOX.prepare('SELECT * FROM promo_counts ORDER BY event, country').all();
  assert.deepEqual(results.map((r) => ({ ...r })), [
    { day: today, event: 'click', country: 'FR', n: 2 },
    { day: today, event: 'click', country: 'XX', n: 1 },
    { day: today, event: 'close', country: 'DE', n: 1 },
  ]);
});

test('_redirects: every vercel.json redirect is copied as a 308, lang groups written out', () => {
  const { redirects } = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const out = toCloudflareRedirects(redirects);
  const lines = out.text.trim().split('\n');
  assert.ok(lines.every((l) => / 308$/.test(l) && l.split(' ').length === 3), 'every line is "<from> <to> 308"');
  assert.ok(!/[()|]/.test(out.text), 'no regex left');
  const expected = redirects.filter((r: any) => !r.has).reduce((n: number, r: any) => n + (/:\w+\(([^)]+)\)/.exec(r.source)?.[1].split('|').length ?? 1), 0);
  assert.equal(lines.length, expected + 3); // + the 3 clean-URL rules
  assert.equal(out.static + out.dynamic, lines.length);
  // Cloudflare treats every line after the first pattern as a pattern (max 100), so all
  // fixed lines must come first.
  const firstPattern = lines.findIndex((l) => /[:*]/.test(l.split(' ')[0]));
  assert.ok(lines.slice(firstPattern).every((l) => /[:*]/.test(l.split(' ')[0])), 'no fixed line after a pattern');
  assert.equal(lines.length - firstPattern, out.dynamic);
  assert.ok(out.dynamic <= 100);
  assert.deepEqual(lines.slice(-2), ['/*/ /:splat 308', '/*.html /:splat 308']);
  assert.equal(lines[0], '/index.html / 308');
  assert.ok(lines.includes('/fr/p/delhi-cjp-election-protest-oct-2026 /fr/p/delhi-cjp-cec-protest-oct-2026 308'));
  assert.ok(lines.includes('/in/:region/:city /city/in/:region/:city 308'));
  assert.ok(!lines.some((l) => l.includes('vercel.app')));

  assert.throws(() => toCloudflareRedirects([{ source: '/a/(.*)', destination: '/b', permanent: true }]), /cannot express/);
  assert.throws(() => toCloudflareRedirects([{ source: '/a', destination: '/b', permanent: false }]), /permanent/);
  assert.throws(() => toCloudflareRedirects([{ source: '/:a(x|y)/:b(z|w)', destination: '/c', permanent: true }]), /more than one/);
  assert.throws(() => toCloudflareRedirects([{ source: '/a', destination: '/:x', permanent: true }]), /not in the source/);
});
