import type { APIRoute, GetStaticPaths } from 'astro';
import { COUNTRIES } from '../../../pipeline/config.ts';
import { countrySvg } from '../../lib/geo';

export const getStaticPaths: GetStaticPaths = () => COUNTRIES.map((c) => ({ params: { iso: c.iso } }));

export const GET: APIRoute = ({ params }) =>
  new Response(countrySvg(params.iso!), { headers: { 'content-type': 'image/svg+xml' } });
