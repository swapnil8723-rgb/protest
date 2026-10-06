import type { APIRoute } from 'astro';
import { BRAND, SITE } from '../site';
import { events } from '../lib/data';

// Google News sitemap: only pages first published in the last 48 hours.
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export const GET: APIRoute = () => {
  const fresh = events.filter((e) => Date.now() - Date.parse(e.publishedAt ?? e.firstSeenAt) < 48 * 3.6e6).slice(0, 1000);
  const body = fresh
    .map(
      (e) =>
        `<url><loc>${SITE}/p/${e.slug}</loc><news:news><news:publication><news:name>${BRAND}</news:name><news:language>en</news:language></news:publication>` +
        `<news:publication_date>${e.publishedAt ?? e.firstSeenAt}</news:publication_date><news:title>${esc(e.title)}</news:title></news:news></url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${body}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
