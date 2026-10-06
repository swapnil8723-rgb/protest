import type { APIRoute } from 'astro';
import { SITE } from '../site';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /cards/*-story.png\n\nSitemap: ${SITE}/sitemap-index.xml\nSitemap: ${SITE}/news-sitemap.xml\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
