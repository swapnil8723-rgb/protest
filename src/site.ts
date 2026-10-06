// The one place the brand and public origin are set. Change the domain here only.
export const SITE = (process.env.SITE_URL || 'https://protesttracker.online').replace(/\/$/, '');
export const BRAND = 'LOUD';
export const TAGLINE = 'Where the world is getting loud right now.';
export const DESCRIPTION =
  'Live protest tracker: every protest in India and 10 more countries explained in 10 seconds — why, what they want, and whether it is still on. Checked against multiple newsrooms.';
/** Public by design (IndexNow serves it at /<key>.txt). */
export const INDEXNOW_KEY = '7f3c9b1e5a2d4c8e9b0a6f1d3e5c7a9b';
export const CONTACT = 'hello@protesttracker.online';
