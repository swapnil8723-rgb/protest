// Server-side map geometry for the locator maps (zero client JS). Boundaries are
// Natural Earth's India point-of-view file (scripts/build-map.ts).
import { geoBounds, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from '../data/world.topo.json';

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
};

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
    return !(c < x0 - pad || a > x1 + pad || d < y0 - pad || b > y1 + pad);
  });
  const me = near.filter((f) => f.properties.iso.toLowerCase() === iso);
  const others = near.filter((f) => f.properties.iso.toLowerCase() !== iso);
  const d = (fs: Feat[]) => fs.map((f) => path(f) ?? '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}"><g id="map">` +
    `<path d="${d(others)}" fill="var(--map-nb, #1f1f2b)" stroke="var(--map-line, #3a3a4f)" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path d="${d(me)}" fill="var(--map-me, #2e2e44)" stroke="var(--map-me-line, #f6f4ff)" stroke-width="1.6" stroke-linejoin="round"/>` +
    `</g></svg>`;
}
