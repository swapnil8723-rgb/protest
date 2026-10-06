// After `astro build`: IndexNow key file and Cloudflare Pages headers.
import fs from 'node:fs';
import { INDEXNOW_KEY } from '../src/site.ts';

fs.writeFileSync(`dist/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
fs.writeFileSync(
  'dist/_headers',
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
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
console.log('postbuild: indexnow key + _headers written');
