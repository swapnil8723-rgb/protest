// Tracking Europe and China closely (Nov 2026): the country search, the words in their
// languages, nationwide stories, and Serious Mode from injury counts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { byIso, COUNTRIES, EUROPE, RULES } from '../pipeline/config.ts';
import { newEvent } from '../pipeline/events.ts';
import { mainPlace, resolvePlace } from '../pipeline/geo.ts';
import { score } from '../pipeline/score.ts';
import { parseItems, pickItems, SWEEP, sweepOrder, titleKey } from '../pipeline/sweep.ts';
import type { ProtestEvent } from '../pipeline/types.ts';
import { looksLikeProtest, sha } from '../pipeline/util.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const item = (title: string, src: string, hours = 2, link = `https://news.google.com/rss/articles/${src}${title.length}`) =>
  `<item><title>${title} - Pub</title><link>${link}</link><pubDate>${new Date(NOW - hours * 3.6e6).toUTCString()}</pubDate><source url="https://${src}">Pub</source></item>`;

test('sweep: every European country and China has a search, and only tracked countries do', () => {
  for (const cc of [...EUROPE, 'cn']) assert.ok(SWEEP.some((s) => s.cc === cc), `no search for ${cc}`);
  for (const s of SWEEP) assert.ok(byIso.has(s.cc), `${s.cc} is not tracked`);
});

test('sweep: reads Google News items and strips the publisher from the headline', () => {
  const [i] = parseItems(item('Strajk &amp; protest w Warszawie', 'tvp.pl'));
  assert.equal(i.title, 'Strajk & protest w Warszawie');
  assert.equal(i.src, 'https://tvp.pl');
  assert.ok(i.publishedAt);
});

test('sweep: keeps fresh protest stories, one per publisher, and skips what it already knows', () => {
  const xml = [
    item('Protest w Warszawie', 'tvp.pl'),
    item('Strajk nauczycieli w Krakowie', 'tvp.pl'), // same publisher
    item('Wyniki kwartalne spółki', 'onet.pl'), // no protest word
    item('Manifestacja w Gdańsku', 'wp.pl', 40), // too old
    item('Protest rolników w Lublinie', 'yahoo.com'), // blocked aggregator
    item('Protest kierowców w Łodzi', 'interia.pl'), // held already
    item('Pikieta w Poznaniu', 'wprost.pl'),
    item('Strajk w Sopocie', 'gazeta.pl', 2, 'https://news.google.com/rss/articles/seen'), // decoded on an earlier run
  ].join('');
  const known = new Set([titleKey('Protest kierowców w Łodzi')]);
  const swept = { [sha('https://news.google.com/rss/articles/seen')]: new Date(NOW).toISOString() };
  assert.deepEqual(pickItems(parseItems(xml), known, swept, 5, NOW).map((i) => i.src), ['https://tvp.pl', 'https://wprost.pl']);
  assert.equal(pickItems(parseItems(xml), known, swept, 1, NOW).length, 1); // the per-country limit
});

test('sweep: big countries first, and the small ones take turns at the front', () => {
  const a = sweepOrder(NOW);
  const b = sweepOrder(NOW + 3 * 3.6e6);
  assert.equal(a[0].cc, 'gb');
  assert.equal(a.length, SWEEP.length);
  const firstSmall = (o: typeof a) => o.find((s) => !s.big)!.cc;
  assert.notEqual(firstSmall(a), firstSmall(b));
});

test('title key works in every script, so a Greek or Chinese story is recognised', () => {
  assert.equal(titleKey('Απεργία: στην Αθήνα!'), 'απεργία στην αθήνα');
  assert.equal(titleKey('香港 抗議，遊行'), '香港 抗議 遊行');
});

test('protest words reach the languages of Europe and China', () => {
  for (const t of [
    'Strajk nauczycieli w Warszawie', 'Sciopero generale a Roma', 'Corteo a Bologna', 'Tüntetés Budapesten', 'Sztrájk a Volánnál',
    'Demonstrace v Praze', 'Stávka učitelů', 'Prosvjed u Zagrebu', 'Grevă generală la București', 'Mielenosoitus Helsingissä',
    'Meeleavaldus Tallinnas', 'Απεργία στην Αθήνα', 'Διαδήλωση στη Θεσσαλονίκη', 'Протест в Софии', 'Мітинг у Києві', 'Забастовка в Минске',
    'İstanbul’da eylem yapıldı', 'Streik i Oslo', 'Staking bij de NS', 'Greve geral em Lisboa', '工人罢工', '香港遊行', '抗議活動',
  ]) assert.ok(looksLikeProtest(t), t);
  for (const t of ['Grevenbroich feiert das Stadtfest', 'Quarterly results beat estimates', 'Wybory w Krakowie', 'Το καιρός στην Αθήνα']) assert.ok(!looksLikeProtest(t), t);
});

test('new countries: China includes Hong Kong and Macau; Taiwan and Kosovo stay out', () => {
  const cn = byIso.get('cn')!;
  assert.deepEqual(cn.fipsAlt, ['HK', 'MC']);
  assert.equal(resolvePlace('Hong Kong', undefined, 'cn')?.region, 'Hong Kong');
  assert.equal(resolvePlace('Macau', undefined, 'cn')?.region, 'Macau');
  for (const iso of ['tw', 'xk', 'hk', 'mo']) assert.ok(!byIso.has(iso), iso);
  for (const iso of ['by', 'lu', 'mt', 'is']) assert.ok(EUROPE.includes(iso) && COUNTRIES.some((c) => c.iso === iso), iso);
});

test('towns over 1,000 people resolve in Europe and the US; big cities still win their name', () => {
  assert.equal(resolvePlace('Lakenheath', 'England', 'gb')?.city, 'Lakenheath');
  assert.equal(resolvePlace('Mount Morris', 'New York', 'us')?.region, 'New York');
  assert.equal(resolvePlace('Berlin', undefined, 'de')?.city, 'Berlin');
  assert.equal(resolvePlace('Paris', undefined, 'fr')?.city, 'Paris');
  assert.equal(resolvePlace('Nowhereville', 'England', 'gb'), null);
});

test('a nationwide story with no city sits on the capital, or the main city of its region', () => {
  assert.equal(mainPlace(undefined, 'es')?.city, 'Madrid');
  assert.equal(mainPlace(undefined, 'de')?.city, 'Berlin');
  assert.equal(mainPlace(undefined, 'nl')?.city, 'Amsterdam');
  assert.equal(mainPlace(undefined, 'cn')?.city, 'Beijing');
  assert.equal(mainPlace('California', 'us')?.city, 'Los Angeles');
  assert.equal(mainPlace(undefined, 'br'), null); // untracked
});

test('Serious Mode switches on from the reported injury count, police included', () => {
  const place = resolvePlace('Frankfurt am Main', 'Hesse', 'de')!;
  const mk = (value: number) => {
    const e = newEvent('t', place, '2026-11-01', [], `${value}`);
    return Object.assign(e, {
      stage: 'live', kind: 'one-day', status: 'ended', firstSeenAt: '2026-11-01T00:00:00Z', lastReportAt: '2026-11-02T00:00:00Z',
      tea: { why: '', want: '', changed: '' }, summary: '', conflicts: [], sources: [],
      numbers: { injuries: { value, text: `${value} police officers injured`, sources: [1] } },
    }) as ProtestEvent;
  };
  const events = new Map([mk(RULES.massInjuries), mk(RULES.massInjuries - 1)].map((e) => [e.id, e]));
  score(events, new Map(), { reviewer: false, now: NOW });
  const [at, below] = [...events.values()];
  assert.equal(at.severity, 'serious');
  assert.equal(below.severity, 'normal');
});
