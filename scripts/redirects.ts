// Turns vercel.json "redirects" into a Cloudflare _redirects file, so vercel.json stays the
// one list that merge-events.ts and withdraw-events.ts write to.
// - Vercel answers these with 308 (checked against the live site on 27 Oct 2026), so every
//   line says 308; Cloudflare's own default would be a temporary 302.
// - Cloudflare has no regex groups: `:lang(hi|mr|es|fr|de)` becomes one line per value.
// - Anything that cannot be expressed exactly throws, failing the build: a wrong redirect
//   is worse than no deploy.

import type { ProtestEvent } from '../pipeline/types.ts';

export interface VercelRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
  has?: unknown[];
}

export const LIMITS = { static: 2000, dynamic: 100, lineLength: 1000 };

// Vercel's cleanUrls + trailingSlash:false answer /today/ and /today.html with a 308 to
// /today. Cloudflare's html_handling would send 307 (temporary), so these say 308 first.
const CLEAN_URLS_FIXED = ['/index.html / 308'];
const CLEAN_URLS_PATTERNS = ['/*/ /:splat 308', '/*.html /:splat 308'];

export function toCloudflareRedirects(redirects: VercelRedirect[]): { text: string; static: number; dynamic: number } {
  // Fixed paths first, then patterns. This order is required, not cosmetic: Cloudflare counts
  // every line after the first pattern as a pattern, and stops reading after 100 of them
  // (with the city patterns first, 287 redirects were silently dropped in testing).
  // The groups never overlap: patterns are the old /<cc>/... city URLs and the clean-URL rules.
  const fixed: string[] = [...CLEAN_URLS_FIXED];
  const patterns: string[] = [];
  for (const r of redirects) {
    // Host-based rules (protesttracker.vercel.app → the real domain) only mean something on Vercel.
    if (r.has) continue;
    if (r.permanent !== true || r.statusCode) throw new Error(`redirect ${r.source}: only permanent redirects are supported`);
    const groups = [...r.source.matchAll(/:(\w+)\(([^)]+)\)/g)];
    if (groups.length > 1) throw new Error(`redirect ${r.source}: more than one (a|b) group`);
    const variants = groups.length
      ? groups[0][2].split('|').map((v) => {
          if (!/^[a-z0-9-]+$/.test(v)) throw new Error(`redirect ${r.source}: unsupported group value ${v}`);
          return { source: r.source.replace(groups[0][0], v), destination: r.destination.replaceAll(`:${groups[0][1]}`, v) };
        })
      : [{ source: r.source, destination: r.destination }];
    for (const { source, destination } of variants) {
      if (/[()?*+[\]{}|\\^$]/.test(source) || /[()?*+[\]{}|\\^$]/.test(destination)) {
        throw new Error(`redirect ${r.source}: pattern Cloudflare cannot express (${source} → ${destination})`);
      }
      if (!source.startsWith('/') || /\s/.test(source + destination)) throw new Error(`redirect ${r.source}: bad path`);
      const params: string[] = source.match(/:\w+/g) ?? [];
      for (const p of destination.match(/:\w+/g) ?? []) {
        if (!params.includes(p)) throw new Error(`redirect ${r.source}: ${p} is not in the source`);
      }
      const line = `${source} ${destination} 308`;
      if (line.length > LIMITS.lineLength) throw new Error(`redirect ${r.source}: line longer than ${LIMITS.lineLength}`);
      (params.length ? patterns : fixed).push(line);
    }
  }
  patterns.push(...CLEAN_URLS_PATTERNS); // last: they match almost anything ending in / or .html
  if (fixed.length > LIMITS.static || patterns.length > LIMITS.dynamic) {
    throw new Error(`_redirects: ${fixed.length} static / ${patterns.length} dynamic, over Cloudflare's ${LIMITS.static} / ${LIMITS.dynamic}`);
  }
  return { text: [...fixed, ...patterns].join('\n') + '\n', static: fixed.length, dynamic: patterns.length };
}

/** Permanent redirects from every merged duplicate's page (English and each language) to the
 *  page it was folded into, following chains (A → B → C sends A to C). Duplicates without a
 *  slug never had a page. When the kept event is not on the site (hidden, withdrawn), the link
 *  goes to the country page instead, as withdraw-events.ts does, so it never turns into a 404. */
export function mergedRedirects(events: Map<string, ProtestEvent>, langs: readonly string[], countrySlug: (iso: string) => string): VercelRedirect[] {
  const out: VercelRedirect[] = [];
  for (const e of events.values()) {
    if (!e.mergedInto || !e.slug) continue;
    let keep = events.get(e.mergedInto);
    for (let hops = 0; keep?.mergedInto && hops < 10; hops++) keep = events.get(keep.mergedInto);
    if (keep?.slug === e.slug) continue;
    const shown = keep && !keep.mergedInto && !keep.withdrawn && keep.published && keep.slug && (keep.stage === 'live' || keep.origin === 'reader');
    const to = shown ? `/p/${keep!.slug}` : `/country/${countrySlug(e.place.country)}`;
    out.push({ source: `/p/${e.slug}`, destination: to, permanent: true });
    // Only the languages this page existed in: each one is a line in Cloudflare's _redirects,
    // which allows 2,000, and a language added later (it/pt/nl) never had these pages.
    const had = langs.filter((l) => (e.i18n as Record<string, unknown> | undefined)?.[l]);
    if (had.length) out.push({ source: `/:lang(${had.join('|')})/p/${e.slug}`, destination: `/:lang${to}`, permanent: true });
    // Its share image too: shared posts and image search keep the old card URL (these 404'd).
    if (shown) out.push({ source: `/cards/${e.slug}-og.png`, destination: `/cards/${keep!.slug}-og.png`, permanent: true });
  }
  return out;
}
