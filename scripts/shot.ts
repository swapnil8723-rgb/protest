// Screenshot pages with the system Chrome for visual QA.
// usage: node scripts/shot.ts <outDir> <width> <path> [path...]   (needs `npm run preview` running)
//   LIGHT=1 for cream mode, FULL=0 for viewport-only, REDUCED=1 for reduced motion
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const [out, width, ...paths] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(width) < 600 ? 800 : 900 },
  deviceScaleFactor: 1,
  reducedMotion: process.env.REDUCED === '1' ? 'reduce' : 'no-preference',
});
if (process.env.LIGHT === '1') await page.addInitScript(() => localStorage.setItem('theme', 'light'));
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
for (const p of paths) {
  await page.goto(`http://127.0.0.1:${process.env.PORT || 4321}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const file = `${out}/${p.replace(/[/?&=]/g, '_') || 'home'}-${width}${process.env.LIGHT === '1' ? '-light' : ''}.png`;
  await page.screenshot({ path: file, fullPage: process.env.FULL !== '0' });
  console.log(file);
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
