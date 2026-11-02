// After `astro build`: IndexNow key file, plus the Cloudflare _headers and _redirects
// (Vercel reads vercel.json instead and ignores both files).
import fs from 'node:fs';
import { INDEXNOW_KEY } from '../src/site.ts';
import { byIso, TRANSLATE_TO } from '../pipeline/config.ts';
import { loadEvents } from '../pipeline/store.ts';
import { mergedRedirects, toCloudflareRedirects, type VercelRedirect } from './redirects.ts';

fs.writeFileSync(`dist/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
fs.writeFileSync(
  'dist/_headers',
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/geo/*
  Cache-Control: public, max-age=604800
/maps/*
  Cache-Control: public, max-age=604800
/cards/*
  Cache-Control: public, max-age=1800
/robots.txt
  Content-Type: text/plain; charset=utf-8
/llms.txt
  Content-Type: text/plain; charset=utf-8
`,
);
// vercel.json, plus a redirect for every duplicate the pipeline merged on its own
// (pipeline/dedupe.ts commits only data/, so those never reach vercel.json).
const listed: VercelRedirect[] = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).redirects ?? [];
const known = new Set(listed.map((r) => r.source));
const extra = mergedRedirects(loadEvents(), TRANSLATE_TO.map((l) => l.code), (iso) => byIso.get(iso)!.slug).filter((r) => !known.has(r.source));
const redirects = toCloudflareRedirects([...listed, ...extra]);
fs.writeFileSync('dist/_redirects', redirects.text);
console.log(`postbuild: indexnow key + _headers + _redirects (${redirects.static} static, ${redirects.dynamic} dynamic, all 308) written`);
