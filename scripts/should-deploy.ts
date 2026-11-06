// Decide whether this run deploys: only when a page changed, or every 2 hours so the
// "checked X min ago" line stays fresh (pages show a stale warning after 6 hours).
// Keeps deploys to ~15-20/day whatever Cloudflare's per-month limits turn out to be.
import fs from 'node:fs';

const read = (f: string) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return {};
  }
};
const changed: string[] = read('data/changed.json').paths ?? [];
const last = read('data/deploy.json').at;
const stale = !last || Date.now() - Date.parse(last) > 2 * 3.6e6;
const force = process.env.FORCE_DEPLOY === 'true';
const deploy = force || changed.length > 0 || stale;
console.log(`deploy=${deploy} (changed ${changed.length}, last deploy ${last ?? 'never'})`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
