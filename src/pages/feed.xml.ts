import type { APIRoute } from 'astro';
import { BRAND, DESCRIPTION, SITE } from '../site';
import { countryOf, verified as events } from '../lib/data';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

export const GET: APIRoute = () => {
  const items = [...events]
    .sort((a, b) => ((a.publishedAt ?? '') < (b.publishedAt ?? '') ? 1 : -1))
    .slice(0, 60)
    .map(
      (e) =>
        `<item><title>${esc(`${e.title} (${e.place.city}, ${countryOf(e).name})`)}</title><link>${SITE}/p/${e.slug}</link><guid isPermaLink="true">${SITE}/p/${e.slug}</guid>` +
        `<pubDate>${new Date(e.publishedAt ?? e.firstSeenAt).toUTCString()}</pubDate><description>${esc(`${e.tea.why} ${e.tea.want} ${e.isOngoing ? 'Still on.' : 'Not ongoing.'}`)}</description>` +
        e.causes.map((c) => `<category>${c}</category>`).join('') +
        `</item>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${BRAND}: new protests</title><link>${SITE}</link><description>${esc(DESCRIPTION)}</description><language>en</language><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`,
    { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } },
  );
};
