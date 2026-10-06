// Build the globe / locator-map topology from Natural Earth's India point-of-view
// countries file (J&K incl. Gilgit-Baltistan and Aksai Chin, and Arunachal Pradesh
// drawn inside India, per India's official position).
// usage: npm run map   → src/data/world.topo.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const raw = path.resolve('.cache/raw');
const zip = path.join(raw, 'ne_10m_admin_0_countries_ind.zip');
if (!fs.existsSync(zip)) {
  const res = await fetch('https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_ind.zip');
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
}

// mapshaper's own .zip reader drops the .dbf attributes, so unpack first.
const dir = path.join(raw, 'ne_ind');
fs.mkdirSync(dir, { recursive: true });
if (process.platform === 'win32') execFileSync('C:/Windows/System32/tar.exe', ['-xf', zip, '-C', dir]);
else execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
const shp = path.join(dir, 'ne_10m_admin_0_countries_ind.shp');

const bin = path.resolve('node_modules/mapshaper/bin/mapshaper');
// The IND file draws India's claimed areas (PoK, Gilgit-Baltistan, Aksai Chin) inside
// India but leaves them inside Pakistan/China too. Erase India from every other
// country so each point belongs to exactly one polygon.
function build(out: string, keep: string, quantization: number) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(process.execPath, [bin,
    '-i', shp, 'name=all',
    '-each', 'iso = ISO_A2_EH === "-99" ? ADM0_A3 : ISO_A2_EH', '-filter-fields', 'iso,NAME',
    '-filter', 'iso === "IN"', '+', 'name=india',
    '-filter', 'iso !== "IN"', 'target=all', '+', 'name=others',
    '-erase', 'india', 'target=others',
    '-merge-layers', 'target=others,india', 'name=countries', 'force',
    '-simplify', keep, 'weighted', 'keep-shapes',
    '-o', out, 'target=countries', 'format=topojson', `quantization=${quantization}`], { stdio: 'inherit' });
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
}
// 3% moves borders by up to ~5 km: under 2px even at the globe's max zoom.
build(path.resolve('public/geo/globe.topo.json'), '3%', 20000);
// Locator maps zoom to one country; 10% keeps Muzaffarabad/Mirpur inside India's outline.
build(path.resolve('src/data/world.topo.json'), '10%', 100000);
