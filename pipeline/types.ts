// Shapes of everything the pipeline stores on the `data` branch. The site reads
// `ProtestEvent` files directly, so changes here are changes to the site's input.

export type Vibe = 'heating-up' | 'peak-loud' | 'cooling-down' | 'wrapped-up' | 'tense';
export type Status = 'ongoing' | 'ended' | 'called-off' | 'demands-met' | 'scheduled';
export type Review = 'auto' | 'pending' | 'approved' | 'rejected';
export type Scope = 'local' | 'multi-city' | 'nationwide';

/** One article we have seen, from GDELT or RSS. Text is never stored (copyright). */
export interface Article {
  url: string;
  publisher: string; // registrable-ish host, e.g. thehindu.com
  via: 'gdelt' | 'rss';
  firstSeenAt: string; // ISO — when the pipeline first saw it
  title?: string;
  description?: string;
  publishedAt?: string; // ISO from the page, if it said
  lang?: string;
  fetch: 'new' | 'ok' | 'failed' | 'skipped';
  fetchError?: string;
  gdelt?: { codes: string[]; fips: string; place?: string; articles: number };
  /** Set once the classify step has looked at it. */
  cls?: Classification;
  eventId?: string;
}

export interface Classification {
  at: string;
  isProtest: boolean;
  reason?: string; // why not, when rejected
  storyLabel?: string; // e.g. "Thackeray-led march against CEC"
  city?: string;
  region?: string;
  country?: string; // iso2
  date?: string; // YYYY-MM-DD the protest happened / starts
  causes?: string[];
  matchEventId?: string | null;
  storyKey?: string; // batch-local key grouping articles about one new story
}

export interface Place {
  city: string;
  region: string;
  country: string; // iso2
  lat: number;
  lng: number;
  citySlug: string;
  regionSlug: string;
}

export interface SourceRef {
  n: number; // 1-based receipt number shown on the page
  url: string;
  publisher: string;
  title: string;
  publishedAt?: string;
}

export interface Figure {
  value: number; // best single number the sources state
  text: string; // as phrased, e.g. "about 5,000", "over 160"
  sources: number[]; // receipt numbers
}

export interface Update {
  at: string; // ISO date (or datetime) the development happened/was reported
  text: string;
  sources: number[];
}

export interface ProtestEvent {
  id: string;
  slug: string;
  /** Hidden until it has enough independent publishers and a summary. */
  stage: 'candidate' | 'live';
  title: string; // neutral headline, ≤ 90 chars
  seoTitle: string; // ≤ 48 chars, used in <title>
  place: Place;
  scope: Scope;
  causes: string[];
  kind: 'one-day' | 'multi-day';
  startedOn: string; // YYYY-MM-DD
  endedOn?: string;
  status: Status;
  vibe: Vibe;
  severity: 'normal' | 'serious';
  review: Review;
  reviewReasons: string[];
  approvedFor?: string[]; // reasons a human already cleared
  notReal?: string; // summary step judged the sources not to describe a real protest
  isOngoing: boolean;
  published: boolean;

  tea: { why: string; want: string; changed: string };
  summary: string;
  organizers: string[];
  demands: string[];
  response: string; // government / authority response, or "No official response reported."
  responseSources?: number[];
  numbers: { crowd?: Figure; arrests?: Figure; injuries?: Figure; deaths?: Figure };
  seriousInjuries?: boolean;
  sensitive?: boolean; // protest is about a death, suicide, sexual violence or harm to a child
  updates: Update[];
  sources: SourceRef[];
  conflicts: string[]; // where sources disagree, plainly stated

  confidence: number; // 0..1
  publishers: number; // independent publishers supporting it
  reports24h: number;
  reportsPrev24h: number;
  reports48h: number;

  firstSeenAt: string;
  publishedAt?: string; // first time it went public
  lastReportAt: string; // newest supporting article
  lastCheckedAt: string; // last pipeline run that looked at it
  summarizedAt?: string;
  summaryOf?: string; // hash of the source URLs the summary was written from
  updatedAt: string; // last time anything visible changed → dateModified
  telegram?: { messageId: number; sentAt: string; sig: string }; // sig = review reasons it was sent for
}

export interface State {
  gdeltCursor?: string; // YYYYMMDDHHMMSS of the last 15-min file processed
  aiCalls: { day: string; count: number };
  telegramOffset?: number;
  lastRunAt?: string;
  runs: RunLog[];
}

export interface RunLog {
  at: string;
  ms: number;
  discovered: number;
  fetched: number;
  classified: number;
  protests: number;
  summarized: number;
  published: number;
  live: number;
  aiCalls: number;
  notes: string[];
}
