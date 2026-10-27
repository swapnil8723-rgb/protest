// GET /api/inbox     → reader reports waiting in the private D1 inbox
// DELETE /api/inbox  → { pathnames: [...] } removes reports the pipeline has handled
// A copy of api/inbox.ts for Cloudflare: same GitHub OIDC check and the same JSON, so
// pipeline/reader.ts works unchanged. Only this repo's GitHub Actions can call it.
import type { Env } from './types.ts';

const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'loud-pipeline';
const DEFAULT_REPO = 'swapnil8723-rgb/protest';

let jwks: { keys: (JsonWebKey & { kid?: string })[] } | undefined;
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64json = (s: string) => JSON.parse(new TextDecoder().decode(b64(s)));

/** Verifies a GitHub Actions OIDC token (RS256) for this repo and audience. */
export async function verifyGithubToken(token: string, now = Date.now(), repo = DEFAULT_REPO, fetchKeys = defaultKeys): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header: any, claims: any;
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    return false;
  }
  if (header.alg !== 'RS256' || claims.iss !== ISSUER || claims.repository !== repo) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUDIENCE) || !(claims.exp * 1000 > now) || (claims.nbf ?? 0) * 1000 > now + 60_000) return false;
  let jwk = (await fetchKeys(false)).keys.find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await fetchKeys(true)).keys.find((k) => k.kid === header.kid); // GitHub rotated keys
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
}

async function defaultKeys(refresh: boolean) {
  if (!jwks || refresh) jwks = await (await fetch(`${ISSUER}/.well-known/jwks`)).json();
  return jwks!;
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

type Verify = (token: string) => Promise<boolean>;

async function authorised(request: Request, env: Env, verify?: Verify) {
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('authorization') ?? '');
  if (!m) return false;
  const check = verify ?? ((t: string) => verifyGithubToken(t, Date.now(), env.READER_REPO || DEFAULT_REPO));
  return check(m[1]).catch(() => false);
}

export async function GET(request: Request, env: Env, verify?: Verify): Promise<Response> {
  if (!(await authorised(request, env, verify))) return json(401, { error: 'unauthorised' });
  const { results } = await env.INBOX.prepare('SELECT id, at, data FROM reports ORDER BY at LIMIT 200').all<{ id: string; at: string; data: string }>();
  const items = results.map((r) => {
    try {
      return { id: r.id, at: r.at, data: JSON.parse(r.data) };
    } catch (e) {
      return { id: r.id, at: r.at, data: null, error: (e as Error).message };
    }
  });
  return json(200, { items });
}

export async function DELETE(request: Request, env: Env, verify?: Verify): Promise<Response> {
  if (!(await authorised(request, env, verify))) return json(401, { error: 'unauthorised' });
  const body: any = await request.json().catch(() => ({}));
  const paths: string[] = (Array.isArray(body.pathnames) ? body.pathnames : []).filter((p: unknown) => typeof p === 'string' && p.startsWith('queue/')).slice(0, 200);
  // D1 allows 100 bound values per statement.
  const chunks: string[][] = [];
  for (let i = 0; i < paths.length; i += 100) chunks.push(paths.slice(i, i + 100));
  if (chunks.length) await env.INBOX.batch(chunks.map((c) => env.INBOX.prepare(`DELETE FROM reports WHERE id IN (${c.map(() => '?').join(', ')})`).bind(...c)));
  return json(200, { deleted: paths.length });
}
