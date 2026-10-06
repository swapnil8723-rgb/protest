import type { APIRoute } from 'astro';
import { SITE } from '../site';
import { COUNTRIES, verified as events } from '../lib/data';

// One sitemap per country (PLAN: "auto sitemap split by country") + one for hub pages.
const latest = (iso?: string) =>
  events.filter((e) => !iso || e.place.country === iso).reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), '2026-10-01T00:00:00.000Z');

export const GET: APIRoute = () => {
  // Countries with no published protest yet are left out: Google flags empty sitemaps.
  // (Their sitemap files still exist, empty, so nothing that linked to them breaks.)
  const withEvents = COUNTRIES.filter((c) => events.some((e) => e.place.country === c.iso));
  const maps: [string, string][] = [['pages', latest()], ...withEvents.map((c) => [c.slug, latest(c.iso)] as [string, string])];
  const body = maps.map(([n, mod]) => `<sitemap><loc>${SITE}/sitemap-${n}.xml</loc><lastmod>${mod}</lastmod></sitemap>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
