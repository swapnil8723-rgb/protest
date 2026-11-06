// GET /api/tick — Vercel Cron (see vercel.json "crons") calls this every hour as a backup
// for GitHub's own schedule, which runs up to 2 h late or not at all on small repos. If no
// pipeline run started in the last 225 minutes, it starts one (workflow_dispatch). Ticks were
// 3 h apart until 25 Oct 2026; with Hobby's up-to-an-hour cron delay a missed GitHub slot
// became a 5-hour gap ("checks paused" banner). Ticks are free; Actions minutes are not, so
// the threshold stays just under the 4-hour cadence and the workflow skips doubles.
// Kept for rollback only: worker/tick.ts is the live copy.
// Needs: CRON_SECRET (Vercel sends it as a Bearer token) and GITHUB_DISPATCH_TOKEN
// (fine-grained token, this repo only, "Actions: read and write").
const REPO =
  process.env.READER_REPO ||
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : 'swapnil8723-rgb/protest');
const RECENT_MINUTES = 225;

/** A scheduled run that skipped itself checked nothing, so it must not reset the clock. */
const skippedItself = (r: any) => r.event === 'schedule' && r.status === 'completed' && Date.parse(r.updated_at) - Date.parse(r.created_at) < 2 * 6e4;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json(401, { error: 'unauthorised' });
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return json(200, { skipped: 'GITHUB_DISPATCH_TOKEN not set' });

  const gh = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/repos/${REPO}/actions/workflows/pipeline.yml${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'loud-tick' },
      signal: AbortSignal.timeout(15000),
    });

  const runs = await gh('/runs?per_page=10');
  if (!runs.ok) return json(502, { error: `list runs ${runs.status}` });
  const last = ((await runs.json()) as any).workflow_runs?.find((r: any) => !skippedItself(r));
  const ageMin = last ? (Date.now() - Date.parse(last.created_at)) / 6e4 : Infinity;
  if (last && (last.status !== 'completed' || ageMin < RECENT_MINUTES)) {
    return json(200, { skipped: 'recent run', lastRun: last.created_at, status: last.status });
  }
  const r = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  return json(r.status === 204 ? 200 : 502, { dispatched: r.status === 204, status: r.status, lastRun: last?.created_at ?? null });
}
