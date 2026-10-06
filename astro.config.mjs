// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Fully static: the pipeline rebuilds and redeploys every 30 minutes, so pages are
// plain HTML on Cloudflare's CDN. Public origin: same rule as SITE in src/site.ts.
export default defineConfig({
  site: process.env.SITE_URL || 'https://protesttracker.online',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  image: { service: passthroughImageService() },
  server: { host: '127.0.0.1' },
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
