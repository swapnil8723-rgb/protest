import type { APIRoute } from 'astro';
import { BRAND, DESCRIPTION, SITE } from '../site';
import { COUNTRIES, countryOf, verified as events } from '../lib/data';

// llms.txt: a plain map of the site for AI answer engines.
export const GET: APIRoute = () => {
  const lines = [
    `# ${BRAND}: live protest tracker`,
    '',
    `> ${DESCRIPTION}`,
    '',
    `Every event page states why people are protesting, what they demand, the authorities' response and whether it is still on, and links each claim to at least two independent newsrooms. Method: ${SITE}/how-we-know`,
    '',
    '## Hubs',
    `- [Protests today](${SITE}/today): every live protest`,
    ...COUNTRIES.map((c) => `- [${c.name} protests](${SITE}/country/${c.slug})`),
    '',
    '## Protests',
    ...events.slice(0, 60).map((e) => `- [${e.title}](${SITE}/p/${e.slug}): ${e.place.city}, ${countryOf(e).name}. ${e.isOngoing ? 'Ongoing.' : 'Not ongoing.'} ${e.tea.why}`),
  ];
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
