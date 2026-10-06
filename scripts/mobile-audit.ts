// Mobile QA: loads pages at phone widths and reports what breaks on a phone.
// usage: node scripts/mobile-audit.ts [path...]   (needs `npm run preview`; PORT=4321 by default)
//   - horizontal scroll (page wider than the screen) and the elements causing it
//   - tap targets smaller than 44×44 px (links/buttons people press with a thumb)
//   - text smaller than 12 px
//   - inputs with font-size < 16 px (iOS zooms the page when they get focus)
import { chromium } from 'playwright-core';

const widths = (process.env.WIDTHS || '360,390,414').split(',').map(Number);
const paths = process.argv.slice(2);
const exe = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe });
let problems = 0;

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const p of paths) {
    await page.goto(`http://127.0.0.1:${process.env.PORT || 4321}${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = { scroll: document.documentElement.scrollWidth - vw, wide: [] as string[], small: [] as string[], tiny: [] as string[], zoom: [] as string[] };
      const name = (el: Element) => {
        const t = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''}> "${t}"`;
      };
      const visible = (el: Element) => {
        const s = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !el.closest('[hidden], [aria-hidden="true"], .sr-only, .hp, .marquee');
      };
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.right > vw + 1 && !el.closest('.overflow-hidden, .overflow-x-auto, [style*="overflow"]')) out.wide.push(`${name(el)} right=${Math.round(b.right)}`);
      }
      for (const el of document.querySelectorAll('a[href], button, summary, input[type=checkbox], input[type=radio], select, label.pill')) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        // Inline links inside a sentence are exempt (WCAG 2.5.8 inline exception).
        const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN|DD)$/.test(el.parentElement.tagName) && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length + 10;
        if (inline) continue;
        // A whole-card link (::after cover) is as big as the card.
        if (el.matches('a[class*="after:absolute"]')) continue;
        // A checkbox/radio inside a big label: the label is what the thumb hits.
        const label = el.closest('label');
        if (label && el.tagName === 'INPUT') {
          const lb = label.getBoundingClientRect();
          if (lb.height >= 44 || (lb.width >= 44 && lb.height >= 24)) continue;
        }
        // An invisible ::after touch area (breadcrumbs, source numbers) counts.
        const after = getComputedStyle(el, '::after');
        if (after.content !== 'none' && after.position === 'absolute') {
          const top = parseFloat(after.top), bottom = parseFloat(after.bottom);
          if (b.height - top - bottom >= 44) continue;
        }
        if (b.height < 44 || b.width < 44) out.small.push(`${name(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement!;
        if (!el || seen.has(el) || !walker.currentNode.textContent!.trim() || !visible(el)) continue;
        seen.add(el);
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) out.tiny.push(`${name(el)} ${fs}px`);
      }
      for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')) {
        if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16) out.zoom.push(name(el));
      }
      return out;
    });
    const uniq = (a: string[]) => [...new Set(a)];
    const lines: string[] = [];
    if (r.scroll > 0) lines.push(`  ✖ page scrolls sideways by ${r.scroll}px`);
    for (const w of uniq(r.wide).slice(0, 6)) lines.push(`  ✖ wider than screen: ${w}`);
    for (const s of uniq(r.small).slice(0, 12)) lines.push(`  · small tap target: ${s}`);
    for (const s of uniq(r.tiny).slice(0, 6)) lines.push(`  · tiny text: ${s}`);
    for (const s of uniq(r.zoom)) lines.push(`  ✖ input < 16px (iOS zoom): ${s}`);
    problems += lines.length;
    console.log(`${lines.length ? '✖' : '✔'} ${width}px ${p}${lines.length ? '' : ' — ok'}`);
    if (lines.length) console.log(lines.join('\n'));
  }
  await page.close();
}
await browser.close();
console.log(`\n${problems} issue lines`);
