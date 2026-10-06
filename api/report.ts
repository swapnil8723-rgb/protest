// POST /api/report — the "Add a protest" form. Stores the raw report in the private
// Blob inbox; nothing is shown until the hourly pipeline has checked it (pipeline/reader.ts).
// Kept self-contained (no imports from pipeline/) so Vercel bundles only this file.
import { head, put } from '@vercel/blob';

const COUNTRIES = new Set(['in', 'us', 'gb', 'fr', 'de', 'es', 'pk', 'bd', 'np', 'ke', 'id']);
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
export function validate(body: any, now = Date.now()): { ok: true; report: ReportInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Empty form.' };
  // Bots: the hidden "website" field must stay empty and a human takes a few seconds.
  if (body.website) return { ok: false, error: 'Something went wrong. Please try again.' };
  if (!(Number(body.ms) >= 4000)) return { ok: false, error: 'That was quick! Please check the details and send again.' };
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
  if (r.title.length < 8) return { ok: false, error: 'Add a short headline (what is happening).' };
  if (r.city.length < 2) return { ok: false, error: 'Which city or town?' };
  if (!COUNTRIES.has(r.country)) return { ok: false, error: 'Pick a country from the list.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.startedOn)) return { ok: false, error: 'Pick the date it started.' };
  const days = (Date.parse(r.startedOn + 'T00:00:00Z') - now) / 864e5;
  if (!(days > -31 && days < 15)) return { ok: false, error: 'We only track protests from the last 30 days or the next 2 weeks.' };
  if (r.why.length < 20) return { ok: false, error: 'Tell us why people are protesting (a sentence or two).' };
  if (r.link) {
    try {
      const u = new URL(r.link);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      r.link = u.toString();
    } catch {
      return { ok: false, error: 'The link does not look like a web address.' };
    }
  }
  return { ok: true, report: r };
}

async function ipKey(request: Request, day: string): Promise<string> {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  const data = new TextEncoder().encode(`${ip}|${day}|${process.env.READER_SALT ?? ''}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'Send JSON.' });
  const raw = await request.text();
  if (raw.length > 8000) return json(413, { error: 'That is too long.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Something went wrong. Please try again.' });
  }
  const v = validate(body);
  if (!v.ok) return json(400, { error: v.error });

  // One file per report; the IP is only used, hashed with a daily salt, to cap reports per person per day.
  const day = new Date().toISOString().slice(0, 10);
  const who = await ipKey(request, day);
  let slot = 0;
  for (let n = 1; n <= PER_IP_PER_DAY; n++) {
    try {
      await head(`queue/${day}/${who}-${n}.json`);
    } catch {
      slot = n;
      break;
    }
  }
  if (!slot) return json(429, { error: `You have sent ${PER_IP_PER_DAY} reports today. Thank you! Try again tomorrow.` });

  try {
    await put(`queue/${day}/${who}-${slot}.json`, JSON.stringify({ ...v.report, submittedAt: new Date().toISOString() }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
  } catch (e) {
    console.error('report: blob put failed', (e as Error).message);
    return json(503, { error: 'Our inbox is busy right now. Please try again in a few minutes.' });
  }
  return json(200, { ok: true });
}

export function GET(): Response {
  return json(405, { error: 'Use the form at /add.' });
}
