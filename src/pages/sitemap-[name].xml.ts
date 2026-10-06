import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE } from '../site';
import { cities, COUNTRIES, events } from '../lib/data';

export const getStaticPaths: GetStaticPaths = () => [{ params: { name: 'pages' } }, ...COUNTRIES.map((c) => ({ params: { name: c.slug } }))];

const url = (path: string, mod?: string, img?: string) =>
  `<url><loc>${SITE}${path}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}${img ? `<image:image><image:loc>${SITE}${img}</image:loc></image:image>` : ''}</url>`;
const newest = (list: { updatedAt: string }[]) => list.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), '2026-10-01T00:00:00.000Z');

export const GET: APIRoute = ({ params }) => {
  let body = '';
  if (params.name === 'pages') {
    const n = newest(events);
    body = url('/', n) + url('/today', n) + url('/how-we-know') + COUNTRIES.map((c) => url(`/country/${c.slug}`, newest(events.filter((e) => e.place.country === c.iso)))).join('');
  } else {
    const c = COUNTRIES.find((x) => x.slug === params.name)!;
    body = events.filter((e) => e.place.country === c.iso).map((e) => url(`/p/${e.slug}`, e.updatedAt, `/cards/${e.slug}-og.png`)).join('');
    for (const [key, list] of cities) if (key.startsWith(c.iso + '/')) body += url(`/${key}`, newest(list));
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
