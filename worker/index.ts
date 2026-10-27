// The Cloudflare Worker for protesttracker.online. Pages, maps and images are static
// assets (dist/) served by Cloudflare without running this code; wrangler.jsonc sends
// only /api/* here (run_worker_first). The hourly Cron Trigger runs the pipeline backup.
import * as inbox from './inbox.ts';
import * as report from './report.ts';
import { tick } from './tick.ts';
import type { Env, ExecutionContext } from './types.ts';

const methodNotAllowed = () =>
  new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/report') {
      if (request.method === 'POST') return report.POST(request, env);
      if (request.method === 'GET') return report.GET();
      return methodNotAllowed();
    }
    if (pathname === '/api/inbox') {
      if (request.method === 'GET') return inbox.GET(request, env);
      if (request.method === 'DELETE') return inbox.DELETE(request, env);
      return methodNotAllowed();
    }
    // Anything else (e.g. an unknown /api/ path) gets the site's own 404 page, as on Vercel.
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env).then((r) => console.log('tick', JSON.stringify(r)), (e) => console.log('tick failed', (e as Error).message)));
  },
};
