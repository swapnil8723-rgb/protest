import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE } from '../site';
import { activeCountries, cities, COUNTRIES, HUBS, verified as events } from '../lib/data';
import { href, LANGS, type Lang } from '../i18n';
import { hasLang } from '../i18n/event';

export const getStaticPaths: GetStaticPaths = () => [{ params: { name: 'pages' } }, ...COUNTRIES.map((c) => ({ params: { name: c.slug } }))];

// One <url> per language version, each listing all versions as hreflang alternates.
const abs = (l: Lang, path: string) => SITE + (href(l, path) === '/' ? '' : href(l, path));
const url = (path: string, mod?: string, img?: string, langs: readonly Lang[] = LANGS) => {
  const alts = langs.length > 1 ? langs.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${abs(l, path)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${abs('en', path)}"/>` : '';
  return langs
    .map((l) => `<url><loc>${abs(l, path)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}${alts}${img ? `<image:image><image:loc>${SITE}${img}</image:loc></image:image>` : ''}</url>`)
    .join('');
};
const newest = (list: { updatedAt: string }[]) => list.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), '2026-10-01T00:00:00.000Z');

export const GET: APIRoute = ({ params }) => {
  let body = '';
  if (params.name === 'pages') {
    const n = newest(events);
    // Only pages with protests on them: empty country/hub pages are noindex until the pipeline fills them.
    body = url('/', n) + url('/today', n) + url('/how-we-know') + url('/add') +
      HUBS.filter((h) => h.list.length > 0).map((h) => url(h.path, newest(h.list))).join('') +
      activeCountries.map((c) => url(`/country/${c.slug}`, newest(events.filter((e) => e.place.country === c.iso)))).join('');
  } else {
    const c = COUNTRIES.find((x) => x.slug === params.name)!;
    body = events.filter((e) => e.place.country === c.iso).map((e) => url(`/p/${e.slug}`, e.updatedAt, `/cards/${e.slug}-og.png`, LANGS.filter((l) => hasLang(e, l)))).join('');
    for (const [key, list] of cities) if (key.startsWith(c.iso + '/')) body += url(`/city/${key}`, newest(list));
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8' } },
  );
};
