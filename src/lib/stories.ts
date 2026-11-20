// Big Stories: news that is not a protest but readers shouldn't miss (owner decision, 31 Oct 2026).
// data/stories/<slug>.json, under the same newsroom rules as a protest card: neutral text, both
// sides, every line sourced, ≥ 2 independent newsrooms or it isn't shown, and the same confidence
// formula. Written by hand, and since 20 Nov 2026 also refreshed once a day by pipeline/stories.ts
// (owner decision), whose rule checks enforce the same bar before a file is written.
import fs from 'node:fs';
import path from 'node:path';
import { RULES } from '../../pipeline/config.ts';
import { confidence } from '../../pipeline/score.ts';
import type { ProtestEvent } from '../../pipeline/types.ts';
import { hoursSince, publisherOf } from '../../pipeline/util.ts';
import { countryName, type Lang } from '../i18n/index.ts';

export const TOPICS = ['sport', 'politics', 'business', 'world'] as const;

export interface Story {
  slug: string; // never changes once set
  title: string;
  seoTitle?: string;
  topic: (typeof TOPICS)[number];
  countries: string[]; // ISO codes, any country (not only tracked ones)
  status: 'developing' | 'settled';
  serious?: boolean; // deaths or serious harm: Serious Mode styling, no jokes near it
  startedOn: string; // YYYY-MM-DD
  dek: string; // one line: what is going on
  happened: string;
  happenedSources: number[];
  sides: { who: string; says: string; sources: number[] }[];
  next: string;
  nextSources: number[];
  summary: string;
  sources: ProtestEvent['sources'];
  conflicts: string[];
  verifiedAt: string; // when every line was last checked against the sources (by a human, or by the daily step when auto)
  auto?: boolean; // written by pipeline/stories.ts
  updatedAt: string;
  // Filled in here, never in the file:
  publishers: number;
  confidence: number;
}

const dir = path.resolve(process.env.DATA_DIR || 'data', 'stories');

export const stories: Story[] = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Story;
    s.publishers = new Set(s.sources.map((x) => publisherOf(x.url))).size;
    s.confidence = confidence({ ...s, lastReportAt: s.verifiedAt, isOngoing: s.status === 'developing' });
    return s;
  })
  .filter((s) => s.publishers >= RULES.minPublishers)
  .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

/** On the home page while someone has checked it in the last 10 days; the page itself stays. */
export const freshStories = stories.filter((s) => hoursSince(s.verifiedAt) < 10 * 24);

/** "Spain, France, China" in the page language; stories may name countries we don't track. */
const enRegion = new Intl.DisplayNames(['en'], { type: 'region' });
export const placeNames = (s: Story, lang: Lang) =>
  s.countries.map((iso) => countryName(iso, lang, enRegion.of(iso.toUpperCase()) ?? iso)).join(', ');

/** Story pages are English only for now, so every language links to the English page. */
export const storyUrl = (s: Story) => `/story/${s.slug}`;
