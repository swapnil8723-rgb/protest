// Pipeline-wide settings. Countries are the single list both the pipeline and the
// site read; add one here (plus its gazetteer rebuild) to start tracking it.

export interface Country {
  iso: string; // ISO 3166-1 alpha-2, lowercase — used in URLs and data
  fips: string; // GDELT ActionGeo_CountryCode (FIPS 10-4)
  name: string;
  slug: string; // /country/[slug]
  tz: string; // for "today" on one-day events
}

export const COUNTRIES: Country[] = [
  { iso: 'in', fips: 'IN', name: 'India', slug: 'india', tz: 'Asia/Kolkata' },
  { iso: 'us', fips: 'US', name: 'United States', slug: 'united-states', tz: 'America/New_York' },
  { iso: 'gb', fips: 'UK', name: 'United Kingdom', slug: 'united-kingdom', tz: 'Europe/London' },
  { iso: 'fr', fips: 'FR', name: 'France', slug: 'france', tz: 'Europe/Paris' },
  { iso: 'de', fips: 'GM', name: 'Germany', slug: 'germany', tz: 'Europe/Berlin' },
  { iso: 'es', fips: 'SP', name: 'Spain', slug: 'spain', tz: 'Europe/Madrid' },
  { iso: 'pk', fips: 'PK', name: 'Pakistan', slug: 'pakistan', tz: 'Asia/Karachi' },
  { iso: 'bd', fips: 'BG', name: 'Bangladesh', slug: 'bangladesh', tz: 'Asia/Dhaka' },
  { iso: 'np', fips: 'NP', name: 'Nepal', slug: 'nepal', tz: 'Asia/Kathmandu' },
  { iso: 'ke', fips: 'KE', name: 'Kenya', slug: 'kenya', tz: 'Africa/Nairobi' },
  { iso: 'id', fips: 'ID', name: 'Indonesia', slug: 'indonesia', tz: 'Asia/Jakarta' },
];

export const byIso = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const byFips = new Map(COUNTRIES.map((c) => [c.fips, c]));

/** Cause stickers. The AI must pick from this list; the site shows them as #tags. */
export const CAUSES = [
  'elections', 'labour', 'farmers', 'students', 'education', 'jobs', 'prices', 'housing', 'land',
  'environment', 'climate', 'water', 'health', 'religion', 'caste', 'ethnic-rights', 'gender',
  'lgbtq', 'police', 'justice', 'free-speech', 'corruption', 'governance', 'anti-government', 'war-peace',
  'palestine', 'immigration', 'reservation', 'transport', 'infrastructure', 'local-civic', 'animal-rights', 'abortion',
] as const;
export type Cause = (typeof CAUSES)[number];

export const LIMITS = {
  /** Hard daily cap on AI calls (plan: 1,000 of Gemini's ~1,500 free). */
  aiCallsPerDay: Number(process.env.AI_DAILY_CAP || 1000),
  /** Articles classified per AI call. */
  classifyBatch: 12,
  /** Max articles fetched per run (keeps a run under a few minutes). */
  fetchPerRun: Number(process.env.FETCH_PER_RUN || 250),
  /** Concurrent article fetches (undici crashes with very high fan-out). */
  fetchConcurrency: 6,
  /** Only consider GDELT rows whose event date is within this many days. */
  gdeltMaxAgeDays: 4,
  /** GDELT 15-minute files to catch up per run (32 = 8 hours). */
  gdeltMaxFiles: Number(process.env.GDELT_MAX_FILES || 32),
  /** Max sources sent to the summary call. */
  summarySources: 10,
  /** No new AI call starts after this many minutes, so the run saves well inside the workflow's 20-minute timeout. */
  aiMinutesPerRun: Number(process.env.AI_MINUTES_PER_RUN || 13),
};

/** Languages the site is published in besides English (src/i18n has the interface text). */
export const TRANSLATE_TO = [
  { code: 'hi', name: 'Hindi', note: 'Devanagari script, neutral standard Hindi as in Hindi newspapers' },
  { code: 'mr', name: 'Marathi', note: 'Devanagari script, standard Marathi as in Marathi newspapers' },
  { code: 'es', name: 'Spanish', note: 'neutral international Spanish' },
  { code: 'fr', name: 'French', note: 'standard French with French typography (space before : ; ? !)' },
  { code: 'de', name: 'German', note: 'standard German' },
] as const;

/** Rules the score/publish steps apply. Mirrors /how-we-know — change both together. */
export const RULES = {
  minPublishers: 2, // independent publishers before an event can be shown
  wrapAfterHours: 48, // no new reports → Wrapped up
  massArrests: 100, // arrests at or above this count switch on Serious Mode
  reviewConfidence: 0.8, // below this an event needs review
  reviewTopN: 10, // biggest live events need review (once)
  peakTopShare: 0.1, // top 10% of live events by report volume → Peak loud
  minPeakVolume: 6, // ...and at least this many reports in 48h
  readerDelayMinutes: 60, // a reader report waits at least this long before its check
  readerPerRun: 25, // reader reports checked per run (one AI call each)
  readerHideAfterDays: 7, // unconfirmed reader reports leave the site this long after they wrap up
  translatePerRun: Number(process.env.TRANSLATE_PER_RUN || 30), // events translated per run (one AI call each)
};
