// Run: npm test   (node --test, no extra deps)
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { knownEvents } from '../pipeline/classify.ts';
import { dedupe, dedupePairs, keeper } from '../pipeline/dedupe.ts';
import type { Ai } from '../pipeline/ai.ts';
import { mergedRedirects } from '../scripts/redirects.ts';
import { edition, toSearch } from '../pipeline/corroborate.ts';
import { independentGroups, newEvent, findSimilar } from '../pipeline/events.ts';
import { parseEvents } from '../pipeline/gdelt.ts';
import { resolvePlace } from '../pipeline/geo.ts';
import { parseFeed } from '../pipeline/rss.ts';
import { score, confidence } from '../pipeline/score.ts';
import { apply, makeSlug, reserveSlugs } from '../pipeline/summarize.ts';
import { extract } from '../pipeline/article.ts';
import type { Article, ProtestEvent } from '../pipeline/types.ts';
import { hostOf, isBlockedUrl, looksLikeProtest, publisherOf, titleSimilarity, unzipFirst, PROTEST_WORDS } from '../pipeline/util.ts';
import type { SummaryOut } from '../pipeline/prompts.ts';

const place = resolvePlace('Mumbai', 'Maharashtra', 'in')!;

test('unzipFirst reads a single-entry zip (central directory)', () => {
  const data = Buffer.from('hello\tworld\n');
  const comp = deflateRawSync(data);
  const name = Buffer.from('a.csv');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt32LE(cd.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, comp, cd, name, eocd]);
  assert.equal(unzipFirst(zip).toString(), 'hello\tworld\n');
});

test('GDELT rows: only recent CAMEO 14 in tracked countries, deduped by URL', () => {
  const row = (root: string, date: string, country: string, url: string, code = '141') => {
    const r = new Array(61).fill('');
    r[1] = date; r[26] = code; r[28] = root; r[33] = '5'; r[52] = 'Mumbai, Maharashtra, India'; r[53] = country; r[59] = '20261004120000'; r[60] = url;
    return r.join('\t');
  };
  const tsv = [
    row('14', '20261004', 'IN', 'https://www.thehindu.com/a'),
    row('14', '20261004', 'IN', 'https://www.thehindu.com/a', '145'),
    row('14', '20251004', 'IN', 'https://www.thehindu.com/old'), // a year old: anniversary/recap
    row('04', '20261004', 'IN', 'https://www.thehindu.com/b'), // not a protest code
    row('14', '20261004', 'BR', 'https://g1.globo.com/c'), // untracked country
    row('14', '20261004', 'IN', 'http://www.asiabulletin.com/news/279350193/x'), // syndication farm
  ].join('\n');
  const hits = parseEvents(tsv, new Date('2026-10-05T00:00:00Z'));
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].codes.sort(), ['141', '145']);
});

test('publisher identity collapses sister titles and blocks aggregators', () => {
  assert.equal(publisherOf('https://economictimes.indiatimes.com/x'), 'indiatimes.com');
  assert.equal(publisherOf('https://timesofindia.indiatimes.com/y'), 'indiatimes.com');
  assert.equal(publisherOf('https://www.bbc.co.uk/news/1'), 'bbc.co.uk');
  assert.ok(isBlockedUrl('https://article.wn.com/view/2026/10/04/x'));
  assert.ok(isBlockedUrl('https://www.youtube.com/watch?v=1'));
  assert.ok(!isBlockedUrl('https://www.thehindu.com/news/x'));
});

test('independent publishers: wire copies with the same headline count once', () => {
  const a = (url: string, title: string) => ({ url, title }) as Article;
  const groups = independentGroups([
    a('https://www.ktvz.com/1', 'Police and high school students clash across France in protests over underfunded education'),
    a('https://kesq.com/2', 'Police and high school students clash across France in protests over underfunded education'),
    a('https://www.theguardian.com/3', 'France school protests escalate into urban violence as PM calls crisis meeting'),
    a('https://economictimes.indiatimes.com/4', 'About 400 French schools closed'),
    a('https://timesofindia.indiatimes.com/5', 'Something else entirely about France'),
  ]);
  assert.equal(groups.length, 3);
  assert.ok(titleSimilarity('Delhi Police detain 700 protesters', 'Delhi police detain 700 protesters at Jantar Mantar') >= 0.6);
});

test('geocoding resolves aliases, regions and refuses unknowns', () => {
  assert.equal(resolvePlace('Bombay', null as any, 'in')?.city, 'Mumbai');
  assert.equal(resolvePlace('New Delhi', 'Delhi', 'in')?.city, 'Delhi');
  assert.equal(resolvePlace('Paris', null as any, 'fr')?.region, 'Île-de-France');
  assert.equal(resolvePlace('San Antonio', 'Texas', 'us')?.regionSlug, 'texas');
  assert.equal(resolvePlace('Muzaffarabad', null as any, 'pk')?.region, 'Pakistan-occupied Kashmir');
  assert.equal(resolvePlace('Atlantis', null as any, 'in'), null);
  assert.equal(resolvePlace('Paris', null as any, 'br'), null); // untracked country
});

test('protest vocabulary gate', () => {
  assert.ok(PROTEST_WORDS.test('Farmers stage dharna outside collectorate'));
  assert.ok(PROTEST_WORDS.test('Grève nationale: les enseignants dans la rue'));
  assert.ok(!PROTEST_WORDS.test('Quarterly results beat estimates'));
});

test('RSS parsing handles CDATA and entities', () => {
  const xml = `<rss><channel><item><title><![CDATA[Students &amp; teachers march]]></title><link>https://www.thehindu.com/a</link><description>Hundreds marched</description><pubDate>Sun, 04 Oct 2026 10:00:00 +0530</pubDate></item></channel></rss>`;
  const [i] = parseFeed(xml);
  assert.equal(i.title, 'Students & teachers march');
  assert.equal(i.publishedAt, '2026-10-04T04:30:00.000Z');
});

test('article extraction prefers JSON-LD articleBody and dates', () => {
  const html = `<html lang="en"><head><meta property="og:title" content="Title here"><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-04T09:00:00+05:30","articleBody":"${'Protesters gathered at the square. '.repeat(20)}"}</script></head><body><p>Subscribe to our newsletter for more updates today please</p></body></html>`;
  const p = extract(html);
  assert.equal(p.title, 'Title here');
  assert.equal(p.publishedAt, '2026-10-04T03:30:00.000Z');
  assert.ok(p.text.startsWith('Protesters gathered'));
});

function summaryOut(over: Partial<SummaryOut> = {}): SummaryOut {
  return {
    is_real: true, not_real_reason: null, same_story_sources: [1, 2, 3], title: 'Opposition march against election chief', seo_title: 'Mumbai march against CEC', slug_words: 'anti-cec-march',
    kind: 'one-day', scope: 'local', started_on: '2026-10-04', ended_on: null, status: 'ongoing', status_sources: [1],
    tea_why: 'They allege the voter roll revision removed eligible voters.', tea_want: 'Resignation of the chief election commissioner.', tea_changed: 'Oct 4: thousands marched to BMC headquarters.',
    summary: 'Opposition parties marched...', organizers: ['Shiv Sena (UBT)'], demands: ['CEC resignation'], response: 'The EC said the revision was lawful.', response_sources: [2],
    crowd: { value: 5000, text: 'about 5,000, police said', sources: [2] }, arrests: { value: 12, text: '12 detained', sources: [] }, injuries: null, deaths: null,
    serious_injuries: false, sensitive: false, updates: [{ date: '2026-10-04', text: 'March reached BMC headquarters.', sources: [3] }], conflicts: [], causes: ['elections', 'not-a-cause'],
    ...over,
  };
}
const arts = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://pub${i}.com/a`, publisher: `pub${i}.com`, title: ['Thackerays lead march to BMC', 'Opposition rally targets election chief', 'Police manage crowds near Metro Cinema', 'Weather update for coastal districts'][i], firstSeenAt: '2026-10-04T10:00:00Z', fetch: 'ok' }) as Article);

test('summary validation drops unsourced numbers, unknown causes, off-story sources', () => {
  const e = newEvent('Thackeray march', place, '2026-10-04', ['elections'], 'x');
  const picked = arts(4);
  const ok = apply(e, summaryOut(), picked, picked, () => {});
  assert.ok(ok);
  assert.equal(e.stage, 'live');
  assert.equal(e.sources.length, 3); // source 4 judged off-story
  assert.equal(picked[3].eventId, undefined);
  assert.ok(e.numbers.crowd);
  assert.equal(e.numbers.arrests, undefined); // no receipt → not shown
  assert.deepEqual(e.causes, ['elections']);
  assert.equal(e.slug, 'mumbai-anti-cec-march-oct-2026');
});

test('summary is rejected with fewer than 2 independent publishers on-story', () => {
  const e = newEvent('x', place, '2026-10-04', [], 'y');
  const picked = arts(3);
  assert.equal(apply(e, summaryOut({ same_story_sources: [1] }), picked, picked, () => {}), false);
  assert.equal(e.stage, 'candidate');
  assert.equal(apply(e, summaryOut({ is_real: false, not_real_reason: 'diplomatic protest' }), picked, picked, () => {}), false);
  assert.equal(e.notReal, 'diplomatic protest');
});

test('slugs are unique and never reused', () => {
  reserveSlugs([{ slug: 'delhi-anti-cec-protest-oct-2026' } as ProtestEvent]);
  const e = newEvent('x', resolvePlace('Delhi', 'Delhi', 'in')!, '2026-10-02', [], 'z');
  assert.equal(makeSlug(e, 'anti-cec-protest'), 'delhi-anti-cec-protest-oct-2026-2');
});

function liveEvent(over: Partial<ProtestEvent>): ProtestEvent {
  const e = newEvent('t', place, '2026-10-04', [], Math.random().toString());
  return Object.assign(e, { stage: 'live', slug: 's' + Math.random(), sources: [{ n: 1, url: 'https://a.com/1', publisher: 'a.com', title: 'A one' }, { n: 2, url: 'https://www.thehindu.com/2', publisher: 'thehindu.com', title: 'B two words' }, { n: 3, url: 'https://c.com/3', publisher: 'c.com', title: 'C three' }] }, over);
}

test('score: serious mode, one-day wrap, quiet wrap, review gates', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const serious = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z', numbers: { arrests: { value: 700, text: 'over 700 detained', sources: [1] } } });
  const oneDay = liveEvent({ kind: 'one-day', startedOn: '2026-10-04', lastReportAt: '2026-10-05T10:00:00Z' });
  const quiet = liveEvent({ kind: 'multi-day', startedOn: '2026-09-25', lastReportAt: '2026-10-01T10:00:00Z' });
  const events = new Map([serious, oneDay, quiet].map((e) => [e.id, e]));
  score(events, new Map(), { now, reviewer: false });
  assert.equal(serious.severity, 'serious');
  assert.equal(serious.vibe, 'tense');
  assert.ok(serious.reviewReasons.includes('serious'));
  assert.equal(serious.published, true); // 3 publishers, no reviewer → strict auto-publish
  assert.equal(oneDay.isOngoing, false);
  assert.equal(oneDay.status, 'ended');
  assert.equal(oneDay.vibe, 'wrapped-up');
  assert.equal(quiet.isOngoing, false);

  // Two newsrooms, nothing else flagged: shows without a reviewer; with harm it waits for a third.
  const two = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z' });
  two.sources = two.sources.slice(0, 2);
  const twoSerious = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z', numbers: { deaths: { value: 1, text: 'one death', sources: [1] } } });
  twoSerious.sources = twoSerious.sources.slice(0, 2);
  score(new Map([two, twoSerious].map((e) => [e.id, e])), new Map(), { now, reviewer: false });
  assert.equal(two.publishers, 2);
  assert.ok(two.reviewReasons.includes('low-confidence'));
  assert.equal(two.published, true);
  assert.equal(twoSerious.published, false);
  score(new Map([[two.id, Object.assign(two, { published: false })]]), new Map(), { now, reviewer: true });
  assert.equal(two.published, false); // a configured reviewer still decides

  // At most 10 two-newsroom events per country go up; a withdrawn one never comes back.
  const many = Array.from({ length: 12 }, (_, i) => {
    const e = liveEvent({ kind: 'multi-day', lastReportAt: `2026-10-05T0${i % 10}:00:00Z` });
    e.sources = e.sources.slice(0, 2);
    return e;
  });
  const gone = Object.assign(liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z' }), { withdrawn: 'owner', published: true });
  score(new Map([...many, gone].map((e) => [e.id, e])), new Map(), { now, reviewer: false });
  assert.equal(many.filter((e) => e.published).length, 10);
  assert.equal(gone.published, false);

  const withReviewer = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z', numbers: { deaths: { value: 1, text: 'one death', sources: [1] } } });
  score(new Map([[withReviewer.id, withReviewer]]), new Map(), { now, reviewer: true });
  assert.equal(withReviewer.review, 'pending');
  assert.equal(withReviewer.published, false);
});

test('a merged duplicate stays hidden and is never matched again', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const keep = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z' });
  const dup = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z', published: true, mergedInto: keep.id });
  score(new Map([keep, dup].map((e) => [e.id, e])), new Map(), { now, reviewer: false });
  assert.equal(keep.published, true);
  assert.equal(dup.published, false); // merged pages come down; vercel.json redirects them
  assert.equal(findSimilar([dup], dup.title, place, '2026-10-04'), undefined);
});

test('duplicate check: same-city pairs with overlapping dates, merged into the oldest page, redirected', async () => {
  const recent = (h: number) => new Date(Date.now() - h * 36e5).toISOString();
  const pune = resolvePlace('Pune', 'Maharashtra', 'in')!;
  const first = liveEvent({ published: true, publishedAt: recent(40), startedOn: '2026-10-31', lastReportAt: recent(2), publishers: 10, title: 'Youth demonstrations turn to evening clashes' });
  const twin = liveEvent({ published: true, publishedAt: recent(20), startedOn: '2026-10-31', lastReportAt: recent(3), publishers: 10, title: 'Gen Z protest turns to looting' });
  const other = liveEvent({ published: true, publishedAt: recent(30), startedOn: '2026-11-01', lastReportAt: recent(4), publishers: 3, title: 'Dockworkers strike over pay' });
  const elsewhere = Object.assign(liveEvent({ published: true, startedOn: '2026-10-31', lastReportAt: recent(2), publishers: 4 }), { place: pune });
  const old = liveEvent({ published: true, startedOn: '2026-10-20', endedOn: '2026-10-21', lastReportAt: recent(100), publishers: 4 });
  const lone = Object.assign(newEvent('One-source candidate', place, '2026-10-31', [], 'x'), { lastReportAt: recent(1), publishers: 1 });
  const lone2 = Object.assign(newEvent('Another candidate', place, '2026-10-31', [], 'y'), { lastReportAt: recent(1), publishers: 1 });
  const events = new Map([first, twin, other, elsewhere, old, lone, lone2].map((e) => [e.id, e]));
  const pairs = dedupePairs(events.values());
  const has = (a: ProtestEvent, b: ProtestEvent) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  assert.ok(has(first, twin) && has(first, other) && has(first, lone));
  assert.ok(!has(first, elsewhere), 'another city is never a duplicate');
  assert.ok(!has(first, old), 'an ended protest 10 days earlier is not paired');
  assert.ok(!has(lone, lone2), 'two hidden one-source candidates are left alone');
  assert.deepEqual(keeper(twin, first), [first, twin]); // longest-live URL keeps its page

  const art = (url: string, eventId: string): Article => ({ url, publisher: hostOf(url), via: 'rss', firstSeenAt: recent(5), fetch: 'ok', title: url, eventId });
  const articles = new Map([art('https://a.com/1', first.id), art('https://b.com/2', twin.id)].map((a) => [a.url, a]));
  const answers = (same: (a: ProtestEvent, b: ProtestEvent) => boolean): Ai => ({
    name: 'fake', calls: 0,
    json: async <T,>() => ({ pairs: dedupePairs(events.values()).map(([a, b], i) => ({ id: `p${i + 1}`, same: same(a, b) })) }) as T,
  });
  const merged = await dedupe(answers((a, b) => [a, b].includes(first) && [a, b].includes(twin)), events, articles, () => {});
  assert.equal(merged, 1);
  assert.equal(twin.mergedInto, first.id);
  assert.equal(articles.get('https://b.com/2')!.eventId, first.id);
  assert.equal(first.summaryOf, undefined); // re-summarised from both sets of sources
  assert.ok(first.distinctFrom!.includes(other.id) && other.distinctFrom!.includes(first.id));
  assert.ok(!dedupePairs(events.values()).some(([a, b]) => [a, b].includes(other) && [a, b].includes(first)), 'a pair judged different is never asked again');

  score(events, articles, { reviewer: false });
  const r = mergedRedirects(events, ['fr', 'de'], () => 'india');
  assert.deepEqual(r, [
    { source: `/p/${twin.slug}`, destination: `/p/${first.slug}`, permanent: true },
    { source: `/:lang(fr|de)/p/${twin.slug}`, destination: `/:lang/p/${first.slug}`, permanent: true },
  ]);
  first.withdrawn = 'owner';
  assert.equal(mergedRedirects(events, ['fr'], () => 'india')[0].destination, '/country/india'); // never a 404
});

test('confidence formula', () => {
  const e = liveEvent({});
  e.publishers = 2;
  e.sources = [{ n: 1, url: 'https://x.com/1', publisher: 'x.com', title: 'x' }];
  assert.equal(confidence(e), 0.7);
  e.publishers = 3;
  e.sources = [{ n: 1, url: 'https://www.thehindu.com/1', publisher: 'thehindu.com', title: 'x' }];
  assert.equal(confidence(e), 0.85);
  e.conflicts = ['Police said 2,000; organisers 20,000'];
  assert.equal(confidence(e), 0.7);
});

test('findSimilar matches same city, close dates, similar label only', () => {
  const ev = newEvent('Protests in Mumbai against CEC Gyanesh Kumar over voter roll revision', place, '2026-10-02', [], 'm');
  assert.equal(findSimilar([ev], 'Protests in Mumbai against CEC Gyanesh Kumar over voter roll revision', place, '2026-10-04'), ev);
  assert.equal(findSimilar([ev], 'Fishers march against desalination plant', place, '2026-10-04'), undefined);
  // identical label: same campaign within 3 weeks (a rally announced for later), not beyond
  assert.equal(findSimilar([ev], 'Protests in Mumbai against CEC Gyanesh Kumar over voter roll revision', place, '2026-10-15'), ev);
  assert.equal(findSimilar([ev], 'Protests in Mumbai against CEC Gyanesh Kumar over voter roll revision', place, '2026-11-02'), undefined);
  // loosely similar label: must be within a week
  assert.equal(findSimilar([ev], 'Protest in Mumbai against CEC', place, '2026-10-15'), undefined);
  assert.equal(resolvePlace('Virudhunagar', 'Tamil Nadu', 'in')?.city, 'Virudunagar');
  assert.equal(resolvePlace('Mahabubabad', null as any, 'in'), null); // fuzzy needs region evidence
});

test('knownEvents keeps a running published story matchable under a flood of new candidates', () => {
  const recent = (h: number) => new Date(Date.now() - h * 36e5).toISOString();
  const story = Object.assign(newEvent('Paris living-costs protests', place, '2026-10-01', [], 's'), { published: true, lastReportAt: recent(72) });
  const flood = Array.from({ length: 300 }, (_, i) => Object.assign(newEvent(`Candidate ${i}`, place, '2026-10-20', [], `c${i}`), { lastReportAt: recent(1) }));
  const known = knownEvents(new Map([story, ...flood].map((e) => [e.id, e])));
  assert.equal(known.length, 250);
  assert.equal(known[0].id, story.id);
});

test('looksLikeProtest: war strikes are not walkouts, labour strikes still count', () => {
  assert.equal(looksLikeProtest('Russian drone strike on Kyiv kills three'), false);
  assert.equal(looksLikeProtest('Ukraine and Russia trade deadly strikes overnight; airstrikes hit refinery'), false);
  assert.equal(looksLikeProtest('Rail workers strike over pay in Milan'), true);
  assert.equal(looksLikeProtest('Air traffic controllers call a strike'), true); // "call a strike", not "air strike"
  assert.equal(looksLikeProtest('Mothers of prisoners of war rally in Kyiv after missile strike'), true);
  assert.equal(looksLikeProtest('Grève générale : la mobilisation continue à Paris'), true);
});

test('second-newsroom search picks fresh single-source candidates, shared across countries', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const mk = (country: string, h: number, over: Partial<ProtestEvent> = {}) =>
    Object.assign(newEvent('t', { ...place, country }, '2026-10-05', [], Math.random().toString()), { lastReportAt: new Date(now - h * 3.6e6).toISOString() }, over);
  const ins = Array.from({ length: 5 }, (_, i) => mk('in', i + 1));
  const us = mk('us', 10);
  const old = mk('us', 60);
  const recent = mk('us', 2, { searchedAt: new Date(now - 3.6e6).toISOString() });
  const two = mk('fr', 1);
  const pubs = (id: string) => new Set(id === two.id ? ['a.com', 'b.com'] : ['a.com']);
  const picked = toSearch([...ins, us, old, recent, two], pubs, 3, now);
  assert.deepEqual(picked.map((e) => e.id), [ins[0].id, us.id, ins[1].id]); // round-robin by country
  two.stage = 'live';
  two.reviewReasons = ['low-confidence', 'sources-disagree']; // held for a third newsroom
  assert.ok(toSearch([two], pubs, 3, now).includes(two));
  assert.equal(publisherOf('https://www.dailysabah.com.tr/x'), 'dailysabah.com.tr');
});

test("second-newsroom search uses the source newsroom's language and edition", () => {
  assert.deepEqual(edition('de', 'de-DE'), { q: 'local', params: 'hl=de&gl=DE&ceid=DE:de' }); // taz is found via German Google News
  assert.equal(edition('pt', 'pt').params, 'hl=pt-150&gl=PT&ceid=PT:pt-150');
  assert.deepEqual(edition('de', 'en'), { q: 'en', params: 'hl=en-US&gl=US&ceid=US:en' }); // DW English stays on our title
  assert.equal(edition('us', undefined).q, 'en');
});
