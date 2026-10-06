// GET /api/inbox     → reader reports waiting in the private Blob inbox
// DELETE /api/inbox  → { pathnames: [...] } removes reports the pipeline has handled
// Only this repo's GitHub Actions can call it: the caller sends the workflow's OIDC
// token (signed by GitHub), so there is no shared secret to copy anywhere.
import { del, get, list } from '@vercel/blob';

const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'loud-pipeline';
const REPO =
  process.env.READER_REPO ||
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : 'swapnil8723-rgb/protest');

let jwks: { keys: (JsonWebKey & { kid?: string })[] } | undefined;
const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64url'));

/** Verifies a GitHub Actions OIDC token (RS256) for this repo and audience. */
export async function verifyGithubToken(token: string, now = Date.now(), repo = REPO, fetchKeys = defaultKeys): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header: any, claims: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
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

async function authorised(request: Request) {
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('authorization') ?? '');
  return !!m && (await verifyGithubToken(m[1]).catch(() => false));
}

export async function GET(request: Request): Promise<Response> {
  if (!(await authorised(request))) return json(401, { error: 'unauthorised' });
  const { blobs } = await list({ prefix: 'queue/', limit: 200 });
  const items = [];
  for (const b of blobs) {
    try {
      const r = await get(b.pathname, { access: 'private', useCache: false });
      if (r?.statusCode !== 200) continue;
      items.push({ id: b.pathname, at: b.uploadedAt, data: JSON.parse(await new Response(r.stream).text()) });
    } catch (e) {
      items.push({ id: b.pathname, at: b.uploadedAt, data: null, error: (e as Error).message });
    }
  }
  return json(200, { items });
}

export async function DELETE(request: Request): Promise<Response> {
  if (!(await authorised(request))) return json(401, { error: 'unauthorised' });
  const body: any = await request.json().catch(() => ({}));
  const paths = (Array.isArray(body.pathnames) ? body.pathnames : []).filter((p: unknown) => typeof p === 'string' && p.startsWith('queue/')).slice(0, 200);
  if (paths.length) await del(paths);
  return json(200, { deleted: paths.length });
}
