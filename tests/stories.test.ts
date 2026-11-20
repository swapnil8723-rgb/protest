// Big Stories written by the daily step (pipeline/stories.ts): the rules, not the AI, decide what goes up.
import assert from 'node:assert/strict';
import test from 'node:test';
import { check, copiedRun, storiesDue, storySlug, unsourcedNumbers, type StoryFile } from '../pipeline/stories.ts';
import type { StoryOut } from '../pipeline/prompts.ts';
import type { Article, State } from '../pipeline/types.ts';

const art = (url: string, title: string): Article => ({ url, title, publisher: new URL(url).hostname, via: 'search', firstSeenAt: '2026-11-18T06:00:00Z', fetch: 'ok' });
const picked = [
  art('https://www.aljazeera.com/news/a', 'Israel parliament elects Eisenkot ally Kahana as speaker'),
  art('https://www.timesofisrael.com/b', 'Knesset votes 66-52 to elect Yashar MK Matan Kahana'),
];
const texts = [
  'Israeli lawmakers elected Matan Kahana as speaker on Tuesday. He received 66 votes in the 120-member Knesset. Likud nominated Ofir Katz, who got 52 votes.',
  'The Knesset elected Kahana by 66-52 after a filibuster. Likud said the vote was "a low point in the Knesset\'s history".',
];
const good = (o: Partial<StoryOut> = {}): StoryOut => ({
  is_news: true, is_protest: false, names_private_people: false, not_reason: null, same_story_sources: [1, 2],
  title: 'Israel elects an Eisenkot ally as Knesset speaker', seo_title: 'Knesset speaker vote', slug_words: 'israel-knesset-speaker-vote',
  topic: 'politics', countries: ['il'], status: 'developing', serious: false, started_on: '2026-11-17',
  dek: 'Matan Kahana won 66 votes to 52 in the 120-seat Knesset.',
  happened: 'On 17 November the Knesset chose Matan Kahana as its speaker, by 66 votes to 52 for Likud nominee Ofir Katz.',
  happened_sources: [1, 2],
  sides: [
    { who: 'Matan Kahana', says: 'He promised to be a speaker for everyone.', sources: [1] },
    { who: 'Likud', says: 'Likud called it "a low point in the Knesset\'s history".', sources: [2] },
  ],
  next: 'Coalition talks continue.', next_sources: [1], summary: 'Kahana, an Eisenkot ally, is the new Knesset speaker after a 66-52 vote.', conflicts: [],
  ...o,
});
const run = (o: Partial<StoryOut> = {}, existing?: StoryFile) => check({ out: good(o), picked, texts, existing, taken: new Set(), now: '2026-11-18T07:00:00.000Z' });
const reason = (r: ReturnType<typeof check>) => ('reason' in r ? r.reason : '');

test('stories: a sourced, neutral page from two newsrooms is published', () => {
  const r = run();
  assert.ok('story' in r, reason(r));
  assert.equal(r.story.slug, 'israel-knesset-speaker-vote-nov-2026');
  assert.deepEqual(r.story.sources.map((s) => s.n), [1, 2]);
  assert.equal(r.story.verifiedAt, '2026-11-18T07:00:00.000Z');
  assert.equal(r.story.auto, true);
});

test('stories: fewer than two independent newsrooms is not published', () => {
  assert.match(reason(run({ same_story_sources: [1] })), /independent newsroom/);
});

test('stories: protests, private people and non-news are left out', () => {
  assert.match(reason(run({ is_protest: true })), /protest/);
  assert.match(reason(run({ names_private_people: true })), /private/);
  assert.match(reason(run({ is_news: false, not_reason: 'opinion piece' })), /not news/);
});

test('stories: tone words only inside quotes', () => {
  assert.match(reason(run({ dek: 'A massive defeat for Netanyahu.' })), /tone word/);
  assert.ok('story' in run({ dek: 'Smotrich called it a "shameful" day; Kahana won 66 votes to 52.' }));
});

test('stories: every side needs a source, and there must be two sides', () => {
  assert.match(reason(run({ sides: [{ who: 'Likud', says: 'It objected.', sources: [] }, { who: 'Kahana', says: 'He spoke.', sources: [1] }] })), /two sides/);
});

test('stories: a number no source states blocks the page', () => {
  assert.match(reason(run({ happened: 'Kahana won 66 votes; 4,500 people watched.' })), /numbers not in any source: 4500/);
  assert.deepEqual(unsourcedNumbers('It cost $115.8 billion in 2026, up 1,488 from 146 000.', ['revenue of 115.8 billion; 1.488 more; 146,000 total']), []);
});

test('stories: a sentence copied from a source blocks the page, a quote does not', () => {
  const src = ['The European Parliament voted in June to allow member states to set up centres outside the bloc and send people there.'];
  assert.ok(copiedRun('Lawmakers: the European Parliament voted in June to allow member states to set up centres outside the bloc.', src));
  assert.equal(copiedRun('The parliament said: "the European Parliament voted in June to allow member states to set up centres outside the bloc".', src), undefined);
});

test('stories: an update keeps its slug and start date', () => {
  const existing = { slug: 'israel-knesset-speaker-kahana-eisenkot-nov-2026', startedOn: '2026-10-27', topic: 'politics' } as StoryFile;
  const r = run({ slug_words: 'something-else', started_on: '2026-11-18' }, existing);
  assert.ok('story' in r);
  assert.equal(r.story.slug, existing.slug);
  assert.equal(r.story.startedOn, '2026-10-27');
});

test('stories: Taiwan and Kosovo are never listed as countries; deaths switch on Serious Mode', () => {
  const r = run({ countries: ['tw', 'xk', 'cn'], happened: 'On 17 November two people were killed; Kahana won 66 votes to 52.' });
  assert.ok('story' in r);
  assert.deepEqual(r.story.countries, ['cn']);
  assert.equal(r.story.serious, true);
});

test('stories: once a day, from 06:00 UTC', () => {
  const s = { aiCalls: { day: '', count: 0 }, runs: [] } as State;
  assert.equal(storiesDue(s, new Date('2026-11-18T04:50:00Z')), false);
  assert.equal(storiesDue(s, new Date('2026-11-18T08:50:00Z')), true);
  s.storiesDay = '2026-11-18';
  assert.equal(storiesDue(s, new Date('2026-11-18T12:50:00Z')), false);
  assert.equal(storiesDue(s, new Date('2026-11-19T08:50:00Z')), true);
});

test('stories: new slugs never collide', () => {
  const taken = new Set(['kerch-bridge-strike-nov-2026']);
  assert.equal(storySlug('Kerch bridge strike', '2026-11-17', taken), 'kerch-bridge-strike-nov-2026-2');
});
