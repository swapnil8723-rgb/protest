// City → centroid, against the GeoNames gazetteer (scripts/build-gazetteer.ts).
// Pins sit on city centroids only (PLAN tone rule 4) — never a street or venue.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Place } from './types.ts';
import { norm, slugify } from './util.ts';

type Row = [name: string, admin1: string, lat: number, lng: number, pop: number, alts: string];
type Gaz = Record<string, { admin1: Record<string, string>; cities: Row[] }>;

let gaz: Gaz | undefined;
let index: Map<string, Map<string, { row: Row; primary: boolean }[]>> | undefined;

// Same place, one page: search intent for these is the bigger name.
const CANONICAL: Record<string, Record<string, string>> = {
  in: { 'new delhi': 'delhi', 'delhi ncr': 'delhi', 'bombay': 'mumbai', 'bangalore': 'bengaluru', 'calcutta': 'kolkata', 'madras': 'chennai', 'gurgaon': 'gurugram' },
  us: { 'washington dc': 'washington', 'washington d c': 'washington', 'new york city': 'new york', 'nyc': 'new york' },
  gb: { 'city of london': 'london', 'westminster': 'london' },
};

function load() {
  if (gaz) return;
  gaz = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./gazetteer.json', import.meta.url)), 'utf8')) as Gaz;
  index = new Map();
  for (const [cc, { cities }] of Object.entries(gaz)) {
    const m = new Map<string, { row: Row; primary: boolean }[]>();
    const add = (k: string, row: Row, primary: boolean) => {
      if (!k) return;
      const list = m.get(k) ?? [];
      if (!list.some((x) => x.row === row)) list.push({ row, primary });
      m.set(k, list);
    };
    for (const row of cities) {
      add(norm(row[0]), row, true);
      for (const a of row[5].split('|')) add(norm(a), row, false);
    }
    index.set(cc, m);
  }
}

export function regionName(cc: string, code: string): string {
  load();
  return gaz![cc]?.admin1[code] ?? '';
}

/** Edit distance, capped (we only care about ≤ 2). */
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Spelling variants ("Virudhunagar" vs GeoNames "Virudunagar"): only names of 6+ letters,
 *  at most 2 edits, and the region must agree — otherwise we would rather not place it. */
function fuzzy(cc: string, key: string, reg: string) {
  if (key.length < 6 || !reg) return undefined;
  const hits: { row: Row; primary: boolean }[] = [];
  for (const row of gaz![cc].cities) {
    const rname = norm(gaz![cc].admin1[row[1]] ?? '');
    if (!(rname === reg || rname.includes(reg) || reg.includes(rname))) continue;
    if (lev(norm(row[0]), key) <= (key.length >= 9 ? 2 : 1)) hits.push({ row, primary: true });
  }
  return hits.length === 1 ? hits : undefined; // ambiguous → refuse
}

// A nationwide story pins on the capital where that isn't the largest city.
const CAPITALS: Record<string, string> = { nl: 'amsterdam', mt: 'valletta', sy: 'damascus', in: 'delhi', us: 'washington', ca: 'ottawa', cn: 'beijing', au: 'canberra', nz: 'wellington', tr: 'ankara', ch: 'bern', pk: 'islamabad', ma: 'rabat' };

/** Where a story with no city sits: the largest city of its region if it names one, else the
 *  country's capital. 115 of 164 stories dropped as "place not resolved" (Oct 2026) were
 *  nationwide ones like "Train drivers strike across Spain". */
export function mainPlace(region: string | undefined, country: string | undefined): Place | null {
  load();
  const cc = (country || '').toLowerCase();
  const g = gaz![cc];
  if (!g) return null;
  const reg = norm(region || '');
  const inRegion = reg ? g.cities.find((row) => {
    const r = norm(g.admin1[row[1]] ?? '');
    return r && (r === reg || r.includes(reg) || reg.includes(r));
  }) : undefined;
  return resolvePlace(inRegion?.[0] ?? CAPITALS[cc] ?? g.cities[0]?.[0], inRegion ? g.admin1[inRegion[1]] : undefined, cc);
}

export function resolvePlace(city: string | undefined, region: string | undefined, country: string | undefined): Place | null {
  load();
  const cc = (country || '').toLowerCase();
  const m = index!.get(cc);
  if (!m || !city) return null;
  let key = norm(city.replace(/\(.*?\)/g, ''));
  key = CANONICAL[cc]?.[key] ?? key;
  let cands = m.get(key);
  // "Jantar Mantar, New Delhi" → try the last comma part too
  if (!cands && city.includes(',')) {
    const last = norm(city.split(',').pop()!);
    cands = m.get(CANONICAL[cc]?.[last] ?? last);
  }
  const reg = norm(region || '');
  if (!cands?.length) cands = fuzzy(cc, key, reg);
  if (!cands?.length) return null;
  const scored = cands.map(({ row, primary }) => {
    const rname = norm(gaz![cc].admin1[row[1]] ?? '');
    const regionHit = reg && rname && (rname === reg || rname.includes(reg) || reg.includes(rname));
    return { row, score: (regionHit ? 10 : 0) + (primary ? 3 : 0) + Math.log10(row[4] + 10) };
  });
  scored.sort((a, b) => b.score - a.score);
  // Ambiguous small-town names with no region evidence: refuse rather than guess.
  const best = scored[0];
  if (scored.length > 1 && !reg && best.row[4] < 100000 && scored[1].row[4] > best.row[4] / 3) return null;
  const [name, a1, lat, lng] = best.row;
  const regionLabel = gaz![cc].admin1[a1] || '';
  return {
    city: name,
    region: regionLabel,
    country: cc,
    lat,
    lng,
    citySlug: slugify(name),
    regionSlug: slugify(regionLabel || 'other'),
  };
}
