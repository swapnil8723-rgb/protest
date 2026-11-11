import type { APIRoute } from 'astro';
import { SITE } from '../site';
import { COUNTRIES, verified as events } from '../lib/data';

// Every child sitemap is listed here as well as in sitemap-index.xml: on 10 Nov 2026 Google's
// Search Console had processed only 2 of the index's 46 sitemaps, while it reads robots.txt
// many times a day. Same list as the index: countries with at least one published protest.
export const GET: APIRoute = () => {
  const maps = ['pages', ...COUNTRIES.filter((c) => events.some((e) => e.place.country === c.iso)).map((c) => c.slug)];
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /cards/*-story.png',
    '',
    `Sitemap: ${SITE}/sitemap-index.xml`,
    `Sitemap: ${SITE}/news-sitemap.xml`,
    ...maps.map((n) => `Sitemap: ${SITE}/sitemap-${n}.xml`),
  ];
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
