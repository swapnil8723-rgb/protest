// Structured data builders (schema.org). dateModified always comes from the
// pipeline's updatedAt, so Google sees real changes, not build times.
import { BRAND, SITE } from '../site';
import type { ProtestEvent } from '../../pipeline/types.ts';
import { byIso } from '../../pipeline/config.ts';

export const org = {
  '@type': 'NewsMediaOrganization',
  '@id': `${SITE}/#org`,
  name: BRAND,
  url: SITE,
  logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png`, width: 512, height: 512 },
  publishingPrinciples: `${SITE}/how-we-know`,
  correctionsPolicy: `${SITE}/how-we-know#corrections`,
  verificationFactCheckingPolicy: `${SITE}/how-we-know#confidence`,
};

export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#site`,
  name: BRAND,
  alternateName: 'LOUD Protest Tracker',
  url: SITE,
  publisher: { '@id': `${SITE}/#org` },
};

export function breadcrumbs(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  };
}

const EVENT_STATUS: Record<string, string> = {
  'called-off': 'https://schema.org/EventCancelled',
};

export function eventJsonLd(e: ProtestEvent) {
  const url = `${SITE}/p/${e.slug}`;
  const country = byIso.get(e.place.country)!;
  const image = [`${SITE}/cards/${e.slug}-og.png`];
  const place = {
    '@type': 'Place',
    name: `${e.place.city}, ${country.name}`,
    address: { '@type': 'PostalAddress', addressLocality: e.place.city, addressRegion: e.place.region || undefined, addressCountry: e.place.country.toUpperCase() },
    geo: { '@type': 'GeoCoordinates', latitude: e.place.lat, longitude: e.place.lng },
  };
  const event = {
    '@type': 'Event',
    '@id': `${url}#event`,
    name: e.title,
    description: [e.tea.why, e.tea.want].filter(Boolean).join(' '),
    startDate: e.startedOn,
    endDate: e.endedOn ?? (e.kind === 'one-day' ? e.startedOn : undefined),
    eventStatus: EVENT_STATUS[e.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    image,
    organizer: e.organizers.length ? e.organizers.map((name) => ({ '@type': 'Organization', name })) : undefined,
  };
  const article = {
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: e.title.slice(0, 110),
    description: e.tea.why,
    datePublished: e.publishedAt ?? e.firstSeenAt,
    dateModified: e.updatedAt,
    mainEntityOfPage: url,
    image,
    author: { '@id': `${SITE}/#org` },
    publisher: { '@id': `${SITE}/#org` },
    about: { '@id': `${url}#event` },
    contentLocation: place,
    isBasedOn: e.sources.map((s) => s.url),
    articleSection: 'Protests',
    keywords: [e.place.city, country.name, ...e.causes, 'protest'].join(', '),
  };
  return { '@context': 'https://schema.org', '@graph': [article, event, org] };
}

export function itemList(events: ProtestEvent[], name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 50).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/p/${e.slug}`, name: e.title })),
  };
}
