import type { APIRoute, GetStaticPaths } from 'astro';
import { COUNTRIES } from '../../../pipeline/config.ts';
import { countrySvg } from '../../lib/geo';

// One map per country, plus the hub maps (src/lib/data.ts HUBS).
export const getStaticPaths: GetStaticPaths = () => [...COUNTRIES.map((c) => c.iso), 'europe'].map((iso) => ({ params: { iso } }));

export const GET: APIRoute = ({ params }) =>
  new Response(countrySvg(params.iso!), { headers: { 'content-type': 'image/svg+xml' } });
