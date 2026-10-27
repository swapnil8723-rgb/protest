// Hourly backup for GitHub's own pipeline schedule, which runs up to 2 h late or not at
// all on small repos. A copy of api/tick.ts for Cloudflare: a Cron Trigger (wrangler.jsonc)
// calls it instead of Vercel Cron, so there is no HTTP route and no CRON_SECRET. If no
// pipeline run started in the last 165 minutes, it starts one (workflow_dispatch); the
// workflow itself skips doubles.
// Needs: GITHUB_DISPATCH_TOKEN (fine-grained token, this repo only, "Actions: read and write").
import type { Env } from './types.ts';

const RECENT_MINUTES = 165;

export async function tick(env: Env, now = Date.now(), fetcher: typeof fetch = fetch): Promise<object> {
  const repo = env.READER_REPO || 'swapnil8723-rgb/protest';
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { skipped: 'GITHUB_DISPATCH_TOKEN not set' };

  const gh = (path: string, init: RequestInit = {}) =>
    fetcher(`https://api.github.com/repos/${repo}/actions/workflows/pipeline.yml${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'loud-tick' },
      signal: AbortSignal.timeout(15000),
    });

  const runs = await gh('/runs?per_page=1');
  if (!runs.ok) return { error: `list runs ${runs.status}` };
  const last = ((await runs.json()) as any).workflow_runs?.[0];
  const ageMin = last ? (now - Date.parse(last.created_at)) / 6e4 : Infinity;
  if (last && (last.status !== 'completed' || ageMin < RECENT_MINUTES)) {
    return { skipped: 'recent run', lastRun: last.created_at, status: last.status };
  }
  const r = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  return { dispatched: r.status === 204, status: r.status, lastRun: last?.created_at ?? null };
}
