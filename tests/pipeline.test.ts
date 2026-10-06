// Run: npm test   (node --test, no extra deps)
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { independentGroups, newEvent, findSimilar } from '../pipeline/events.ts';
import { parseEvents } from '../pipeline/gdelt.ts';
import { resolvePlace } from '../pipeline/geo.ts';
import { parseFeed } from '../pipeline/rss.ts';
import { score, confidence } from '../pipeline/score.ts';
import { apply, makeSlug, reserveSlugs } from '../pipeline/summarize.ts';
import { extract } from '../pipeline/article.ts';
import type { Article, ProtestEvent } from '../pipeline/types.ts';
import { isBlockedUrl, publisherOf, titleSimilarity, unzipFirst, PROTEST_WORDS } from '../pipeline/util.ts';
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

  const withReviewer = liveEvent({ kind: 'multi-day', lastReportAt: '2026-10-05T10:00:00Z', numbers: { deaths: { value: 1, text: 'one death', sources: [1] } } });
  score(new Map([[withReviewer.id, withReviewer]]), new Map(), { now, reviewer: true });
  assert.equal(withReviewer.review, 'pending');
  assert.equal(withReviewer.published, false);
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
