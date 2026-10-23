// Server-side map geometry for the locator maps (zero client JS). Boundaries are
// Natural Earth's India point-of-view file (scripts/build-map.ts).
import { geoBounds, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from '../data/world.topo.json';
import { EUROPE } from '../../pipeline/config.ts';

type Feat = GeoJSON.Feature<GeoJSON.Geometry, { iso: string; NAME: string }>;
const world = feature(topo as any, (topo as any).objects.countries) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { iso: string; NAME: string }>;
const feats = world.features as Feat[];

/** Map frames per country (lon/lat). Mainland framing; overseas territories are off-frame. */
const BBOX: Record<string, [number, number, number, number]> = {
  in: [67.5, 6.2, 98.2, 37.6],
  us: [-125, 24, -66.5, 49.6],
  gb: [-8.4, 49.8, 2.0, 59.2],
  fr: [-5.3, 41.3, 9.7, 51.2],
  de: [5.8, 47.2, 15.1, 55.1],
  es: [-9.5, 35.9, 4.4, 43.9],
  pk: [60.8, 23.6, 77.9, 37.1],
  bd: [88.0, 20.6, 92.7, 26.7],
  np: [80.0, 26.3, 88.3, 30.5],
  ke: [33.9, -4.8, 41.9, 5.1],
  id: [95.0, -11.0, 141.0, 6.1],
  it: [6.6, 36.6, 18.6, 47.1],
  nl: [3.3, 50.7, 7.3, 53.6],
  be: [2.5, 49.5, 6.4, 51.5],
  pl: [14.1, 49.0, 24.2, 54.9],
  pt: [-9.6, 36.9, -6.2, 42.2],
  gr: [19.3, 34.8, 28.3, 41.8],
  at: [9.5, 46.3, 17.2, 49.1],
  ch: [5.9, 45.8, 10.5, 47.9],
  se: [11.0, 55.3, 24.2, 69.1],
  dk: [8.0, 54.5, 12.7, 57.8],
  ie: [-10.5, 51.4, -5.9, 55.4],
  cz: [12.1, 48.5, 18.9, 51.1],
  hu: [16.1, 45.7, 22.9, 48.6],
  ro: [20.2, 43.6, 29.7, 48.3],
  rs: [18.8, 42.2, 23.0, 46.2],
  al: [19.2, 39.6, 21.1, 42.7],
  ge: [40.0, 41.0, 46.8, 43.6],
  tr: [25.6, 35.8, 44.9, 42.2],
  ua: [22.1, 44.3, 40.3, 52.4],
  ru: [27.0, 41.0, 90.0, 70.0], // European Russia to Novosibirsk; the Far East is off-frame
  europe: [-10.5, 34.5, 45.0, 64.0], // hub map: Lisbon to the Caucasus
};

/** Hub maps highlight a group of countries instead of one. */
const GROUPS: Record<string, string[]> = { europe: EUROPE };

export const MAP_W = 640;
export const MAP_H = 440;

export function projectionFor(iso: string): GeoProjection {
  const [x0, y0, x1, y1] = BBOX[iso] ?? [-180, -60, 180, 80];
  const frame: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPoint', coordinates: [[x0, y0], [x1, y1], [x0, y1], [x1, y0]] },
  };
  return geoMercator().fitExtent([[16, 16], [MAP_W - 16, MAP_H - 16]], frame).clipExtent([[0, 0], [MAP_W, MAP_H]]);
}

/** Pin position as % of the map box, or null when the city falls outside the frame. */
export function pinFor(iso: string, lng: number, lat: number): { x: number; y: number } | null {
  const p = projectionFor(iso)([lng, lat]);
  if (!p || p[0] < 0 || p[0] > MAP_W || p[1] < 0 || p[1] > MAP_H) return null;
  return { x: (p[0] / MAP_W) * 100, y: (p[1] / MAP_H) * 100 };
}

/** Standalone SVG of the country (highlighted) and its neighbours. */
export function countrySvg(iso: string): string {
  const proj = projectionFor(iso);
  const path = geoPath(proj).digits(1);
  const [x0, y0, x1, y1] = BBOX[iso] ?? [-180, -60, 180, 80];
  const pad = 8;
  const near = feats.filter((f) => {
    const [[a, b], [c, d]] = geoBounds(f);
    if (d < y0 - pad || b > y1 + pad) return false;
    // Russia (and Fiji…) cross the antimeridian: their bounds come back with west > east.
    return a > c || !(c < x0 - pad || a > x1 + pad);
  });
  const mine = GROUPS[iso] ?? [iso];
  const me = near.filter((f) => mine.includes(f.properties.iso.toLowerCase()));
  const others = near.filter((f) => !mine.includes(f.properties.iso.toLowerCase()));
  const d = (fs: Feat[]) => fs.map((f) => path(f) ?? '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}"><g id="map">` +
    `<path d="${d(others)}" fill="var(--map-nb, #1f1f2b)" stroke="var(--map-line, #3a3a4f)" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path d="${d(me)}" fill="var(--map-me, #2e2e44)" stroke="var(--map-me-line, #f6f4ff)" stroke-width="1.6" stroke-linejoin="round"/>` +
    `</g></svg>`;
}
