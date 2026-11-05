// POST /api/promo?e=click|close — how often the KryVault ad is clicked or closed. A running
// total per day and country: no IP, cookie or id is read or kept, so nobody can be told apart.
import type { Env } from './types.ts';

const EVENTS = new Set(['click', 'close']);

export async function POST(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const event = url.searchParams.get('e') ?? '';
  if (!EVENTS.has(event) || request.headers.get('origin') !== url.origin) return new Response(null, { status: 400 });
  const cc = (request as Request & { cf?: { country?: string } }).cf?.country ?? '';
  try {
    await env.INBOX.prepare('INSERT INTO promo_counts (day, event, country, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, event, country) DO UPDATE SET n = n + 1')
      .bind(new Date().toISOString().slice(0, 10), event, /^[A-Z0-9]{2}$/.test(cc) ? cc : 'XX')
      .run();
  } catch (err) {
    console.log('promo count failed', (err as Error).message);
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
