// POST /api/report on Cloudflare — the "Add a protest" form. A copy of api/report.ts
// (same rules, messages and codes) that stores the raw report in D1 instead of Vercel
// Blob; nothing is shown until the pipeline has checked it (pipeline/reader.ts).
// tests/reader.test.ts runs the same cases against both copies.
import type { Env } from './types.ts';
import { COUNTRIES as TRACKED } from '../pipeline/config.ts';

// Every country the site tracks, the same list the form offers (it was a hard-coded 11 until
// 11 Nov 2026, so a report from Italy, Portugal or Canada was turned away as "pick a country").
const COUNTRIES = new Set(TRACKED.map((c) => c.iso));
const PER_IP_PER_DAY = 3;

export interface ReportInput {
  title: string;
  city: string;
  region: string;
  country: string;
  startedOn: string; // YYYY-MM-DD
  stillOn: 'yes' | 'no' | 'soon';
  why: string;
  want: string;
  organisers: string;
  link: string;
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Returns the cleaned report, or an error message a person can act on. */
export function validate(body: any, now = Date.now()): { ok: true; report: ReportInput } | { ok: false; error: string; code: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Empty form.', code: 'generic' };
  // Bots: the hidden "website" field must stay empty and a human takes a few seconds.
  if (body.website) return { ok: false, error: 'Something went wrong. Please try again.', code: 'generic' };
  if (!(Number(body.ms) >= 4000)) return { ok: false, error: 'That was quick! Please check the details and send again.', code: 'fast' };
  const r: ReportInput = {
    title: text(body.title, 120),
    city: text(body.city, 80),
    region: text(body.region, 80),
    country: text(body.country, 2).toLowerCase(),
    startedOn: text(body.startedOn, 10),
    stillOn: (['yes', 'no', 'soon'].includes(body.stillOn) ? body.stillOn : 'yes') as ReportInput['stillOn'],
    why: text(body.why, 600),
    want: text(body.want, 600),
    organisers: text(body.organisers, 160),
    link: text(body.link, 500),
  };
  if (r.title.length < 8) return { ok: false, error: 'Add a short headline (what is happening).', code: 'title' };
  if (r.city.length < 2) return { ok: false, error: 'Which city or town?', code: 'city' };
  if (!COUNTRIES.has(r.country)) return { ok: false, error: 'Pick a country from the list.', code: 'country' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.startedOn)) return { ok: false, error: 'Pick the date it started.', code: 'date' };
  const days = (Date.parse(r.startedOn + 'T00:00:00Z') - now) / 864e5;
  if (!(days > -31 && days < 15)) return { ok: false, error: 'We only track protests from the last 30 days or the next 2 weeks.', code: 'date' };
  if (r.why.length < 20) return { ok: false, error: 'Tell us why people are protesting (a sentence or two).', code: 'why' };
  if (r.link) {
    try {
      const u = new URL(r.link);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      r.link = u.toString();
    } catch {
      return { ok: false, error: 'The link does not look like a web address.', code: 'link' };
    }
  }
  return { ok: true, report: r };
}

async function ipKey(request: Request, day: string, salt: string): Promise<string> {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const data = new TextEncoder().encode(`${ip}|${day}|${salt}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(request: Request, env: Env): Promise<Response> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'Send JSON.', code: 'generic' });
  const raw = await request.text();
  if (raw.length > 8000) return json(413, { error: 'That is too long.', code: 'long' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Something went wrong. Please try again.', code: 'generic' });
  }
  const v = validate(body);
  if (!v.ok) return json(400, { error: v.error, code: v.code });

  // One row per report; the IP is only used, hashed with a daily salt, to cap reports per person per day.
  // Like the Blob version, a slot frees up once the pipeline has handled (deleted) that report.
  const day = new Date().toISOString().slice(0, 10);
  const who = await ipKey(request, day, env.READER_SALT ?? '');
  try {
    const { results } = await env.INBOX.prepare('SELECT n FROM reports WHERE day = ? AND who = ?').bind(day, who).all<{ n: number }>();
    const used = new Set(results.map((r) => r.n));
    let slot = 0;
    for (let n = 1; n <= PER_IP_PER_DAY; n++) {
      if (!used.has(n)) {
        slot = n;
        break;
      }
    }
    if (!slot) return json(429, { error: `You have sent ${PER_IP_PER_DAY} reports today. Thank you! Try again tomorrow.`, code: 'limit' });
    const at = new Date().toISOString();
    await env.INBOX.prepare('INSERT INTO reports (id, day, who, n, at, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`queue/${day}/${who}-${slot}.json`, day, who, slot, at, JSON.stringify({ ...v.report, submittedAt: at }))
      .run();
  } catch (e) {
    console.error('report: d1 write failed', (e as Error).message);
    return json(503, { error: 'Our inbox is busy right now. Please try again in a few minutes.', code: 'busy' });
  }
  return json(200, { ok: true });
}

export function GET(): Response {
  return json(405, { error: 'Use the form at /add.' });
}
