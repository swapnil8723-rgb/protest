// The one place the brand and public origin are set. Change the domain here only.
export const SITE = (process.env.SITE_URL || 'https://protesttracker.online').replace(/\/$/, '');
export const BRAND = 'LOUD';
export const TAGLINE = 'Where the world is getting loud right now.';
export const DESCRIPTION =
  'Live protest map for the US, Europe, the UK, Australia, the Middle East and India. Every protest explained in 10 seconds — why, what they want, and whether it is still on. Checked against multiple newsrooms.';
/** Public by design (IndexNow serves it at /<key>.txt). */
export const INDEXNOW_KEY = '7f3c9b1e5a2d4c8e9b0a6f1d3e5c7a9b';
export const CONTACT = 'support@protesttracker.online';
/** Who publishes the site: named on /about and /privacy and in the organisation markup. */
export const PUBLISHER = { name: 'FinTrack AI Solutions', url: 'https://fintrackaisolution.com' };
