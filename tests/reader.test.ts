// Reader reports: the form endpoint's validation, the inbox's GitHub token check,
// and the pipeline step that checks and publishes reports.
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import test from 'node:test';
import * as vercelReport from '../api/report.ts';
import * as vercelInbox from '../api/inbox.ts';
import * as cfReport from '../worker/report.ts';
import * as cfInbox from '../worker/inbox.ts';
import type { Ai } from '../pipeline/ai.ts';
import { newEvent } from '../pipeline/events.ts';
import { resolvePlace } from '../pipeline/geo.ts';
import type { ReaderOut } from '../pipeline/prompts.ts';
import { processReaderReports, scoreReaders, type Inbox, type InboxItem } from '../pipeline/reader.ts';
import type { ProtestEvent } from '../pipeline/types.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const form = {
  title: 'Students protest fee hike at Savitribai Phule Pune University',
  city: 'Pune', region: 'Maharashtra', country: 'in', startedOn: '2026-10-06', stillOn: 'yes',
  why: 'The university raised hostel and exam fees by a third this term.', want: 'Roll back the fee hike.',
  organisers: 'Students Federation', link: '', website: '', ms: 30000,
};

// The Vercel functions (api/) and their Cloudflare copies (worker/) must behave the same.
for (const [host, { validate }] of [['vercel', vercelReport], ['cloudflare', cfReport]] as const) {
test(`form validation (${host}): accepts a normal report, rejects bots and bad input`, () => {
  const ok = validate(form, NOW);
  assert.equal(ok.ok, true);
  assert.equal(validate({ ...form, website: 'http://spam' }, NOW).ok, false); // honeypot
  assert.equal(validate({ ...form, ms: 900 }, NOW).ok, false); // too fast for a person
  assert.equal(validate({ ...form, country: 'br' }, NOW).ok, false); // not tracked
  assert.equal(validate({ ...form, startedOn: '2026-08-01' }, NOW).ok, false); // > 30 days ago
  assert.equal(validate({ ...form, why: 'fees' }, NOW).ok, false);
  assert.equal(validate({ ...form, link: 'javascript:alert(1)' }, NOW).ok, false);
  const clean = validate({ ...form, title: 'Fee\u0000 protest\n\nat   PUNE university' }, NOW);
  assert.equal(clean.ok && clean.report.title, 'Fee protest at PUNE university');
});
}

test('form validation: Cloudflare copy gives exactly the Vercel answer for every country and field', () => {
  const countries = 'in us gb fr de es pk bd np ke id ca it br au nz ua ru tr ps xx'.split(' ');
  const cases = [
    ...countries.map((country) => ({ ...form, country })),
    { ...form, title: 'short' }, { ...form, city: 'x' }, { ...form, startedOn: '2026/10/06' }, { ...form, startedOn: '2026-10-25' },
    { ...form, link: 'example.org' }, { ...form, link: 'https://example.org/a b' }, { ...form, stillOn: 'maybe' }, { ...form, ms: '5000' },
    null, 'text', {},
  ];
  for (const c of cases) assert.deepEqual(cfReport.validate(c, NOW), vercelReport.validate(c, NOW), JSON.stringify(c));
});

for (const [host, { verifyGithubToken, AUDIENCE }] of [['vercel', vercelInbox], ['cloudflare', cfInbox]] as const) {
test(`inbox (${host}) accepts only a GitHub-signed token for this repo and audience`, async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1' };
  const keys = async () => ({ keys: [jwk] });
  const sign = (claims: object, kid = 'k1') => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const body = `${b({ alg: 'RS256', typ: 'JWT', kid })}.${b(claims)}`;
    return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url')}`;
  };
  const good = { iss: 'https://token.actions.githubusercontent.com', aud: AUDIENCE, repository: 'me/protest', exp: NOW / 1000 + 300, nbf: NOW / 1000 - 5 };
  assert.equal(await verifyGithubToken(sign(good), NOW, 'me/protest', keys), true);
  assert.equal(await verifyGithubToken(sign({ ...good, repository: 'evil/fork' }), NOW, 'me/protest', keys), false);
  assert.equal(await verifyGithubToken(sign({ ...good, aud: 'other' }), NOW, 'me/protest', keys), false);
  assert.equal(await verifyGithubToken(sign({ ...good, exp: NOW / 1000 - 1 }), NOW, 'me/protest', keys), false);
  const tampered = sign(good).split('.');
  tampered[1] = Buffer.from(JSON.stringify({ ...good, repository: 'me/protest', aud: AUDIENCE, exp: good.exp + 9999 })).toString('base64url');
  assert.equal(await verifyGithubToken(tampered.join('.'), NOW, 'me/protest', keys), false);
  assert.equal(await verifyGithubToken('not.a.token', NOW, 'me/protest', keys), false);
});
}

function memInbox(items: InboxItem[]): Inbox & { left: InboxItem[] } {
  const box = {
    left: items,
    async list() { return box.left; },
    async done(ids: string[]) { box.left = box.left.filter((i) => !ids.includes(i.id)); },
  };
  return box;
}
const fakeAi = (answer: (prompt: string) => Partial<ReaderOut>): Ai & { prompts: string[] } => {
  const ai = {
    name: 'fake', calls: 0, prompts: [] as string[],
    async json<T>(_t: string, _s: string, prompt: string): Promise<T> {
      ai.calls++;
      ai.prompts.push(prompt);
      return { decision: 'publish', reason: 'ok', title: 'Students protest fee hike at Pune university', why: 'The university raised hostel and exam fees.', want: 'A rollback of the fee hike.',
        summary: 'A reader reported that students are protesting a fee hike.', organizers: ['Students Federation'], demands: ['Roll back fees'], causes: ['students', 'education', 'nonsense'], slug_words: 'students fee hike',
        ...answer(prompt) } as T;
    },
  };
  return ai;
};
const item = (id: string, minutesAgo: number, over: object = {}): InboxItem => ({
  id: `queue/2026-10-06/${id}.json`, at: new Date(NOW - minutesAgo * 6e4).toISOString(),
  data: { ...form, submittedAt: new Date(NOW - minutesAgo * 6e4).toISOString(), ...over },
});

test('reader reports: wait an hour, then publish, hold or reject after the check', async () => {
  const events = new Map<string, ProtestEvent>();
  const inbox = memInbox([
    item('fresh', 20), // too new: waits
    item('ok', 70),
    item('harm', 75, { title: 'Police lathi-charge farmers at Nashik onion price protest', city: 'Nashik', why: 'Police beat farmers who blocked the highway over onion prices, many injured.' }),
    item('spam', 80, { title: 'Buy cheap followers now!!!', why: 'Best followers for your account, visit my site today' }),
    item('nowhere', 90, { city: 'Atlantis Town', region: '' }),
  ]);
  const ai = fakeAi((p) =>
    p.includes('lathi') ? { decision: 'hold', reason: 'claims injuries', title: 'Farmers block highway over onion prices in Nashik' }
    : p.includes('followers') ? { decision: 'reject', reason: 'spam' }
    : {});
  const r = await processReaderReports(ai, events, inbox, () => {}, { now: NOW });
  assert.equal(r.waiting, 1);
  assert.equal(r.published.length, 1);
  assert.equal(r.held.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.reason).sort(), ['check: spam', 'place not found: Atlantis Town']);
  assert.equal(ai.calls, 3); // the unknown city never reaches the AI
  assert.deepEqual(inbox.left.map((i) => i.id), ['queue/2026-10-06/fresh.json']); // handled ones deleted

  const pub = events.get(r.published[0])!;
  assert.equal(pub.origin, 'reader');
  assert.equal(pub.stage, 'candidate'); // still matchable by newsroom articles
  assert.equal(pub.published, true);
  assert.match(pub.slug, /^pune-.*-oct-2026$/);
  assert.deepEqual(pub.causes, ['students', 'education']); // unknown cause dropped
  assert.equal(pub.place.city, 'Pune');
  const held = events.get(r.held[0])!;
  assert.equal(held.published, false);
  assert.deepEqual(held.reviewReasons, ['reader-claims-harm']);
  // the report reached the AI as data, inside the prompt
  assert.ok(ai.prompts[0].includes('untrusted text'));
});

test('reader reports: a second report of the same protest is merged, not duplicated', async () => {
  const events = new Map<string, ProtestEvent>();
  const ai = fakeAi(() => ({}));
  await processReaderReports(ai, events, memInbox([item('a', 70)]), () => {}, { now: NOW });
  const r2 = await processReaderReports(ai, events, memInbox([item('b', 65)]), () => {}, { now: NOW });
  assert.equal(events.size, 1);
  assert.equal(r2.merged.length, 1);
  assert.equal([...events.values()][0].reader!.count, 2);
});

test('reader reports: a report of something newsrooms already cover is dropped', async () => {
  const place = resolvePlace('Pune', 'Maharashtra', 'in')!;
  const news = newEvent('Students protest fee hike at Pune university', place, '2026-10-06', [], 'n');
  news.stage = 'live';
  const events = new Map([[news.id, news]]);
  const r = await processReaderReports(fakeAi(() => ({})), events, memInbox([item('c', 70)]), () => {}, { now: NOW });
  assert.equal(events.size, 1);
  assert.deepEqual(r.merged, [news.id]);
});

test('scoreReaders: still on, wraps after 48h quiet, hides a week later', async () => {
  const events = new Map<string, ProtestEvent>();
  await processReaderReports(fakeAi(() => ({})), events, memInbox([item('d', 70, { startedOn: '2026-10-04' })]), () => {}, { now: NOW });
  const e = [...events.values()][0];
  scoreReaders(events, NOW);
  assert.equal(e.kind, 'multi-day');
  assert.equal(e.isOngoing, true);
  assert.equal(e.vibe, 'heating-up');
  scoreReaders(events, NOW + 50 * 3.6e6);
  assert.equal(e.isOngoing, false);
  assert.equal(e.status, 'ended');
  assert.equal(e.published, true);
  scoreReaders(events, NOW + 10 * 864e5);
  assert.equal(e.published, false);
});

test('reader reports: a report of a protest already held for harm claims stays held (merged)', async () => {
  const events = new Map<string, ProtestEvent>();
  const ai = fakeAi((p) => (p.includes('injured') ? { decision: 'hold', reason: 'claims injuries' } : {}));
  await processReaderReports(ai, events, memInbox([item('h', 80, { why: 'Police hit students at the fee protest and several were injured.' }), item('n', 70)]), () => {}, { now: NOW });
  assert.equal(events.size, 1);
  const e = [...events.values()][0];
  assert.equal(e.published, false);
  assert.equal(e.reader!.count, 2);
});
