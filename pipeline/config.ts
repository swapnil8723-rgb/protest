// Pipeline-wide settings. Countries are the single list both the pipeline and the
// site read; add one here (plus its gazetteer rebuild) to start tracking it.

export interface Country {
  iso: string; // ISO 3166-1 alpha-2, lowercase — used in URLs and data
  fips: string; // GDELT ActionGeo_CountryCode (FIPS 10-4)
  fipsAlt?: string[]; // extra GDELT codes for the same country (Palestine = West Bank + Gaza)
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
  // Europe (added Oct 2026: most readers are in the US and Europe)
  { iso: 'it', fips: 'IT', name: 'Italy', slug: 'italy', tz: 'Europe/Rome' },
  { iso: 'nl', fips: 'NL', name: 'Netherlands', slug: 'netherlands', tz: 'Europe/Amsterdam' },
  { iso: 'be', fips: 'BE', name: 'Belgium', slug: 'belgium', tz: 'Europe/Brussels' },
  { iso: 'pl', fips: 'PL', name: 'Poland', slug: 'poland', tz: 'Europe/Warsaw' },
  { iso: 'pt', fips: 'PO', name: 'Portugal', slug: 'portugal', tz: 'Europe/Lisbon' },
  { iso: 'gr', fips: 'GR', name: 'Greece', slug: 'greece', tz: 'Europe/Athens' },
  { iso: 'at', fips: 'AU', name: 'Austria', slug: 'austria', tz: 'Europe/Vienna' },
  { iso: 'ch', fips: 'SZ', name: 'Switzerland', slug: 'switzerland', tz: 'Europe/Zurich' },
  { iso: 'se', fips: 'SW', name: 'Sweden', slug: 'sweden', tz: 'Europe/Stockholm' },
  { iso: 'dk', fips: 'DA', name: 'Denmark', slug: 'denmark', tz: 'Europe/Copenhagen' },
  { iso: 'ie', fips: 'EI', name: 'Ireland', slug: 'ireland', tz: 'Europe/Dublin' },
  { iso: 'cz', fips: 'EZ', name: 'Czechia', slug: 'czechia', tz: 'Europe/Prague' },
  { iso: 'hu', fips: 'HU', name: 'Hungary', slug: 'hungary', tz: 'Europe/Budapest' },
  { iso: 'ro', fips: 'RO', name: 'Romania', slug: 'romania', tz: 'Europe/Bucharest' },
  { iso: 'rs', fips: 'RI', name: 'Serbia', slug: 'serbia', tz: 'Europe/Belgrade' },
  { iso: 'al', fips: 'AL', name: 'Albania', slug: 'albania', tz: 'Europe/Tirane' },
  { iso: 'ge', fips: 'GG', name: 'Georgia', slug: 'georgia', tz: 'Asia/Tbilisi' },
  { iso: 'tr', fips: 'TU', name: 'Turkey', slug: 'turkey', tz: 'Europe/Istanbul' },
  { iso: 'ua', fips: 'UP', name: 'Ukraine', slug: 'ukraine', tz: 'Europe/Kyiv' },
  { iso: 'ru', fips: 'RS', name: 'Russia', slug: 'russia', tz: 'Europe/Moscow' },
  // More of Europe (added 24 Oct 2026)
  { iso: 'fi', fips: 'FI', name: 'Finland', slug: 'finland', tz: 'Europe/Helsinki' },
  { iso: 'no', fips: 'NO', name: 'Norway', slug: 'norway', tz: 'Europe/Oslo' },
  { iso: 'sk', fips: 'LO', name: 'Slovakia', slug: 'slovakia', tz: 'Europe/Bratislava' },
  { iso: 'bg', fips: 'BU', name: 'Bulgaria', slug: 'bulgaria', tz: 'Europe/Sofia' },
  { iso: 'hr', fips: 'HR', name: 'Croatia', slug: 'croatia', tz: 'Europe/Zagreb' },
  { iso: 'si', fips: 'SI', name: 'Slovenia', slug: 'slovenia', tz: 'Europe/Ljubljana' },
  { iso: 'ba', fips: 'BK', name: 'Bosnia and Herzegovina', slug: 'bosnia-and-herzegovina', tz: 'Europe/Sarajevo' },
  { iso: 'me', fips: 'MJ', name: 'Montenegro', slug: 'montenegro', tz: 'Europe/Podgorica' },
  { iso: 'mk', fips: 'MK', name: 'North Macedonia', slug: 'north-macedonia', tz: 'Europe/Skopje' },
  { iso: 'md', fips: 'MD', name: 'Moldova', slug: 'moldova', tz: 'Europe/Chisinau' },
  { iso: 'lt', fips: 'LH', name: 'Lithuania', slug: 'lithuania', tz: 'Europe/Vilnius' },
  { iso: 'lv', fips: 'LG', name: 'Latvia', slug: 'latvia', tz: 'Europe/Riga' },
  { iso: 'ee', fips: 'EN', name: 'Estonia', slug: 'estonia', tz: 'Europe/Tallinn' },
  { iso: 'cy', fips: 'CY', name: 'Cyprus', slug: 'cyprus', tz: 'Asia/Nicosia' },
  { iso: 'am', fips: 'AM', name: 'Armenia', slug: 'armenia', tz: 'Asia/Yerevan' },
  { iso: 'az', fips: 'AJ', name: 'Azerbaijan', slug: 'azerbaijan', tz: 'Asia/Baku' },
  // Middle East & North Africa (added 24 Oct 2026)
  { iso: 'il', fips: 'IS', name: 'Israel', slug: 'israel', tz: 'Asia/Jerusalem' },
  { iso: 'ps', fips: 'WE', fipsAlt: ['GZ'], name: 'Palestine', slug: 'palestine', tz: 'Asia/Hebron' },
  { iso: 'lb', fips: 'LE', name: 'Lebanon', slug: 'lebanon', tz: 'Asia/Beirut' },
  { iso: 'jo', fips: 'JO', name: 'Jordan', slug: 'jordan', tz: 'Asia/Amman' },
  { iso: 'sy', fips: 'SY', name: 'Syria', slug: 'syria', tz: 'Asia/Damascus' },
  { iso: 'iq', fips: 'IZ', name: 'Iraq', slug: 'iraq', tz: 'Asia/Baghdad' },
  { iso: 'ir', fips: 'IR', name: 'Iran', slug: 'iran', tz: 'Asia/Tehran' },
  { iso: 'eg', fips: 'EG', name: 'Egypt', slug: 'egypt', tz: 'Africa/Cairo' },
  { iso: 'ma', fips: 'MO', name: 'Morocco', slug: 'morocco', tz: 'Africa/Casablanca' },
  { iso: 'tn', fips: 'TS', name: 'Tunisia', slug: 'tunisia', tz: 'Africa/Tunis' },
  // North America (Canada: 7th-biggest reader country, Oct 2026)
  { iso: 'ca', fips: 'CA', name: 'Canada', slug: 'canada', tz: 'America/Toronto' },
];

/** Region hubs (/region/<slug>): countries grouped for "protests in Europe today". */
export const EUROPE = ['gb', 'fr', 'de', 'es', 'it', 'nl', 'be', 'pl', 'pt', 'gr', 'at', 'ch', 'se', 'dk', 'ie', 'cz', 'hu', 'ro', 'rs', 'al', 'ge', 'tr', 'ua', 'ru',
  'fi', 'no', 'sk', 'bg', 'hr', 'si', 'ba', 'me', 'mk', 'md', 'lt', 'lv', 'ee', 'cy', 'am', 'az'];
export const MIDDLE_EAST = ['il', 'ps', 'lb', 'jo', 'sy', 'iq', 'ir', 'eg', 'tr', 'ma', 'tn'];

export const byIso = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const byFips = new Map(COUNTRIES.flatMap((c) => [c.fips, ...(c.fipsAlt ?? [])].map((f) => [f, c] as const)));

/** Cause stickers. The AI must pick from this list; the site shows them as #tags. */
export const CAUSES = [
  'elections', 'labour', 'farmers', 'students', 'education', 'jobs', 'prices', 'housing', 'land',
  'environment', 'climate', 'water', 'health', 'religion', 'caste', 'ethnic-rights', 'gender',
  'lgbtq', 'police', 'justice', 'free-speech', 'corruption', 'governance', 'anti-government', 'war-peace', 'ukraine-war',
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
