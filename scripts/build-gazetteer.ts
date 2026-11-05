// Build the city gazetteer the pipeline geocodes against: GeoNames cities5000
// (towns > 5,000 people) for the tracked countries + first-level region names; cities1000
// for Europe and the US, where a protest at a small town was otherwise dropped.
// GeoNames data is CC BY 4.0 — credited on /how-we-know.
// usage: npm run gazetteer   → pipeline/gazetteer.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COUNTRIES, EUROPE } from '../pipeline/config.ts';

const raw = path.resolve('.cache/raw');
fs.mkdirSync(raw, { recursive: true });

async function download(url: string, file: string) {
  const dest = path.join(raw, file);
  if (fs.existsSync(dest)) return dest;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

const zip = await download('https://download.geonames.org/export/dump/cities5000.zip', 'cities5000.zip');
const zipTowns = await download('https://download.geonames.org/export/dump/cities1000.zip', 'cities1000.zip');
const admin1File = await download('https://download.geonames.org/export/dump/admin1CodesASCII.txt', 'admin1CodesASCII.txt');
for (const z of [zip, zipTowns]) {
  if (process.platform === 'win32') execFileSync('C:/Windows/System32/tar.exe', ['-xf', z, '-C', raw]);
  else execFileSync('unzip', ['-o', '-q', z, '-d', raw]);
}

// Hong Kong and Macau are listed under China, each as one region.
const PART_OF: Record<string, string> = { HK: 'CN', MO: 'CN' };
const TOWNS = new Set([...EUROPE, 'us'].map((c) => c.toUpperCase()));
const wanted = new Set([...COUNTRIES.map((c) => c.iso.toUpperCase()), ...Object.keys(PART_OF)]);
const out: Record<string, { admin1: Record<string, string>; cities: [string, string, number, number, number, string][] }> = {};
for (const c of COUNTRIES) out[c.iso] = { admin1: {}, cities: [] };

for (const line of fs.readFileSync(admin1File, 'utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (!code) continue;
  const [cc, a1] = code.split('.');
  if (wanted.has(cc) && !PART_OF[cc]) out[cc.toLowerCase()].admin1[a1] = name;
}

// Region names follow India's official position (PLAN tone rule 5).
const REGION_NAMES: Record<string, Record<string, string>> = {
  pk: { '06': 'Pakistan-occupied Kashmir', '07': 'Gilgit-Baltistan (PoK)' },
  us: { DC: 'Washington, D.C.' },
};
for (const [cc, names] of Object.entries(REGION_NAMES)) Object.assign(out[cc].admin1, names);

const ASCII_NAMES = new Set(['IN', 'PK', 'BD', 'NP', 'KE', 'ID', 'TR', 'AL', 'GE', 'UA', 'RU', 'MD', 'AM', 'AZ', 'IL', 'PS', 'LB', 'JO', 'SY', 'IQ', 'IR', 'EG', 'MA', 'TN', 'JP', 'CN', 'HK', 'MO', 'BY']);
const latin = /^[\p{Script=Latin}\d\s'’.()-]+$/u;
out.cn.admin1.HK = 'Hong Kong';
out.cn.admin1.MO = 'Macau';
const seen = new Set<string>();
for (const line of [...fs.readFileSync(path.join(raw, 'cities5000.txt'), 'utf8').split('\n'), ...fs.readFileSync(path.join(raw, 'cities1000.txt'), 'utf8').split('\n')]) {
  const f = line.split('\t');
  if (f.length < 15 || !wanted.has(f[8]) || seen.has(f[0])) continue;
  const small = Number(f[14]) < 5000;
  if (small && !TOWNS.has(f[8])) continue;
  seen.add(f[0]);
  // PPLX = section of a populated place (neighbourhoods); keep them only if large,
  // they otherwise shadow the real city ("Delhi Cantonment").
  if (f[7] === 'PPLX' && Number(f[14]) < 200000) continue;
  // South Asian / East African / Indonesian names read better in their usual
  // English spelling ("Muzaffarabad", not "Muzaffarābād"; "Istanbul", not "İstanbul");
  // keep accents for the EU.
  const name = ASCII_NAMES.has(f[8]) ? f[2] : f[1];
  const alts = [...new Set(f[3].split(',').map((s) => s.trim())
    .filter((s) => s && s.length <= 32 && latin.test(s) && s !== name && s !== f[2]))].slice(0, small ? 5 : 25);
  for (const n of [f[1], f[2]]) if (n !== name && !alts.includes(n)) alts.unshift(n);
  out[(PART_OF[f[8]] ?? f[8]).toLowerCase()].cities.push([
    name, PART_OF[f[8]] ? f[8] : f[10], Math.round(Number(f[4]) * 1e4) / 1e4, Math.round(Number(f[5]) * 1e4) / 1e4, Number(f[14]), alts.join('|'),
  ]);
}
for (const c of Object.values(out)) c.cities.sort((a, b) => b[4] - a[4]);

const dest = path.resolve('pipeline/gazetteer.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('wrote', dest, fs.statSync(dest).size, 'bytes');
for (const [cc, c] of Object.entries(out)) console.log(cc, c.cities.length, 'cities', Object.keys(c.admin1).length, 'regions');
