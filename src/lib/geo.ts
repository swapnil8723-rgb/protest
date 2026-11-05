// Server-side map geometry for the locator maps (zero client JS). Boundaries are
// Natural Earth's India point-of-view file (scripts/build-map.ts).
import { geoBounds, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from '../data/world.topo.json';
import { EUROPE, MIDDLE_EAST } from '../../pipeline/config.ts';

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
  fi: [20.5, 59.7, 31.6, 70.1],
  no: [4.6, 57.9, 31.1, 71.2],
  sk: [16.8, 47.7, 22.6, 49.6],
  bg: [22.3, 41.2, 28.6, 44.2],
  hr: [13.4, 42.4, 19.5, 46.6],
  si: [13.3, 45.4, 16.6, 46.9],
  ba: [15.7, 42.5, 19.7, 45.3],
  me: [18.4, 41.8, 20.4, 43.6],
  mk: [20.4, 40.8, 23.1, 42.4],
  md: [26.6, 45.4, 30.2, 48.5],
  lt: [20.9, 53.9, 26.9, 56.5],
  lv: [20.9, 55.6, 28.3, 58.1],
  ee: [21.7, 57.5, 28.3, 59.7],
  cy: [32.2, 34.5, 34.7, 35.8],
  am: [43.4, 38.8, 46.7, 41.4],
  az: [44.7, 38.3, 50.6, 41.9],
  il: [34.2, 29.4, 35.9, 33.4],
  ps: [34.2, 31.2, 35.6, 32.6],
  lb: [35.1, 33.0, 36.7, 34.7],
  jo: [34.9, 29.1, 39.4, 33.4],
  sy: [35.6, 32.3, 42.4, 37.4],
  iq: [38.7, 29.0, 48.8, 37.4],
  ir: [44.0, 25.0, 63.4, 39.8],
  eg: [24.6, 21.9, 36.9, 31.7],
  ma: [-13.2, 27.6, -1.0, 35.9], // Morocco without Western Sahara (GeoNames lists it separately)
  tn: [7.5, 30.2, 11.6, 37.6],
  ca: [-141.0, 41.6, -52.6, 62.0], // the populated south; the Arctic is off-frame
  au: [112.9, -43.8, 153.7, -10.6], // mainland and Tasmania
  nz: [166.3, -47.4, 178.6, -34.3],
  jp: [126.5, 24.0, 146.0, 45.6], // the four main islands and Okinawa
  cn: [73.5, 18.0, 135.1, 53.6],
  by: [23.1, 51.2, 32.8, 56.2],
  lu: [5.7, 49.4, 6.6, 50.2],
  mt: [14.1, 35.8, 14.6, 36.1],
  is: [-24.6, 63.3, -13.4, 66.6],
  europe: [-10.5, 34.5, 45.0, 64.0], // hub map: Lisbon to the Caucasus
  'middle-east': [-13.0, 21.0, 63.5, 42.5], // hub map: Morocco to Iran
};

/** Hub maps highlight a group of countries instead of one. */
const GROUPS: Record<string, string[]> = { europe: EUROPE, 'middle-east': MIDDLE_EAST, cn: ['cn', 'hk', 'mo'] };

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
