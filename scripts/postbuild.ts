// After `astro build`: IndexNow key file, plus the Cloudflare _headers and _redirects
// (Vercel reads vercel.json instead and ignores both files).
import fs from 'node:fs';
import { INDEXNOW_KEY } from '../src/site.ts';
import { toCloudflareRedirects } from './redirects.ts';

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
`,
);
const redirects = toCloudflareRedirects(JSON.parse(fs.readFileSync('vercel.json', 'utf8')).redirects ?? []);
fs.writeFileSync('dist/_redirects', redirects.text);
console.log(`postbuild: indexnow key + _headers + _redirects (${redirects.static} static, ${redirects.dynamic} dynamic, all 308) written`);
