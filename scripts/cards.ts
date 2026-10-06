// Share art for every published event, rendered at build time (Satori → SVG → resvg → PNG):
//   public/cards/<slug>-og.png      1200×630   (Open Graph / X / WhatsApp link previews)
//   public/cards/<slug>-story.png   1080×1920  (Instagram / WhatsApp story, "Spill the tea")
//   public/og-default.png           1200×630   (hub pages)
// Renders are cached in .cache/cards by content hash, so a 30-minute rebuild only
// draws cards whose text actually changed. Serious Mode cards are grey, no stickers.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { byIso } from '../pipeline/config.ts';
import { loadEvents } from '../pipeline/store.ts';
import type { ProtestEvent } from '../pipeline/types.ts';
import { sha } from '../pipeline/util.ts';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files', file));
const fonts = [
  { name: 'Bricolage', data: font('@fontsource/bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff'), weight: 800 as const, style: 'normal' as const },
  { name: 'Inter', data: font('@fontsource/inter', 'inter-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Inter', data: font('@fontsource/inter', 'inter-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Mono', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
];

const SITE_HOST = (process.env.SITE_URL || 'https://protesttracker.online').replace(/^https?:\/\//, '').replace(/\/$/, '');
const VERSION = '3'; // bump to force a full re-render after design changes
const C = { bg: '#0B0B12', ink: '#F6F4FF', muted: '#A7A3BC', pink: '#FF3D81', lime: '#C6FF00', cyan: '#00E5FF', yellow: '#FFD60A', violet: '#7C3AED', black: '#0B0B12', sBg: '#F3F4F6', sInk: '#1F2937', sLine: '#9CA3AF' };

// Tiny hyperscript for Satori's React-like element objects.
type Node = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: (Node | string | false | null | undefined)[]): Node {
  const kids = children.filter((c) => c !== false && c !== null && c !== undefined);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
const vibeColor = (e: ProtestEvent) => (e.vibe === 'cooling-down' ? C.cyan : e.vibe === 'wrapped-up' ? C.lime : e.status === 'scheduled' ? C.yellow : C.pink);
const vibeWord = (e: ProtestEvent) =>
  e.status === 'scheduled' ? 'COMING UP' : ({ 'heating-up': 'HEATING UP', 'peak-loud': 'PEAK LOUD', 'cooling-down': 'COOLING DOWN', 'wrapped-up': 'WRAPPED UP', tense: 'SERIOUS' } as const)[e.vibe];
const verdict = (e: ProtestEvent) => (e.status === 'scheduled' ? 'SOON' : e.isOngoing ? 'YES' : 'NO');
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

function logo(size: number, serious: boolean) {
  return h('div', { alignItems: 'center', gap: size * 0.3 },
    h('div', { width: size, height: size, borderRadius: size * 0.25, background: serious ? C.sLine : C.pink, border: `${Math.round(size / 14)}px solid ${C.black}`, transform: 'rotate(-8deg)', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bricolage', fontSize: size * 0.62, color: C.black }, 'L'),
    h('div', { fontFamily: 'Bricolage', fontSize: size * 0.72, color: serious ? C.sInk : C.ink, letterSpacing: -2 }, 'LOUD'),
  );
}

function sticker(e: ProtestEvent, size: number) {
  return h('div', { alignItems: 'center', gap: size * 0.5, background: vibeColor(e), color: C.black, border: `${Math.max(3, size / 6)}px solid ${C.black}`, borderRadius: 999, padding: `${size * 0.45}px ${size}px`, fontFamily: 'Bricolage', fontSize: size * 1.25, letterSpacing: 1 },
    h('div', { width: size * 0.7, height: size * 0.7, borderRadius: 99, background: C.black }), vibeWord(e));
}

function og(e: ProtestEvent): Node {
  const serious = e.severity === 'serious';
  const fg = serious ? C.sInk : C.ink;
  const where = `${e.place.city}, ${byIso.get(e.place.country)?.name} · ${e.kind === 'multi-day' ? 'since ' : ''}${day(e.startedOn)}`;
  return h('div', { width: 1200, height: 630, background: serious ? C.sBg : C.bg, flexDirection: 'column', padding: 56, fontFamily: 'Inter', color: fg },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      logo(54, serious),
      serious
        ? h('div', { fontFamily: 'Mono', fontSize: 22, color: C.sInk, border: `2px solid ${C.sLine}`, borderRadius: 999, padding: '8px 18px' }, 'SUMMARY')
        : sticker(e, 18)),
    h('div', { marginTop: 36, fontFamily: 'Bricolage', fontSize: e.title.length > 70 ? 54 : 62, lineHeight: 1.02, letterSpacing: -1.5, color: fg }, clip(e.title, 110)),
    h('div', { marginTop: 22, fontSize: 28, lineHeight: 1.3, color: serious ? '#4B5563' : C.muted }, clip(e.tea.why, 140)),
    h('div', { marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' },
      h('div', { flexDirection: 'column', gap: 8 },
        h('div', { fontFamily: 'Mono', fontSize: 22, color: fg }, where),
        h('div', { fontFamily: 'Mono', fontSize: 20, color: serious ? '#4B5563' : C.muted }, `${e.publishers} newsrooms · ${Math.round(e.confidence * 100)}% sure · ${SITE_HOST}`)),
      h('div', { flexDirection: 'column', alignItems: 'center', background: serious ? '#FFFFFF' : verdict(e) === 'YES' ? C.lime : C.yellow, color: C.black, border: `4px solid ${serious ? C.sLine : C.black}`, borderRadius: 22, padding: '12px 26px', boxShadow: serious ? 'none' : `8px 8px 0 ${C.violet}` },
        h('div', { fontFamily: 'Mono', fontSize: 16, letterSpacing: 2 }, 'STILL ON?'),
        h('div', { fontFamily: 'Bricolage', fontSize: 64, lineHeight: 1 }, verdict(e)))),
  );
}

function story(e: ProtestEvent): Node {
  const serious = e.severity === 'serious';
  const fg = serious ? C.sInk : C.ink;
  const rows: [string, string][] = [['WHY', e.tea.why], ['WANT', e.tea.want], ['LATEST', e.tea.changed]].filter(([, v]) => v) as [string, string][];
  return h('div', { width: 1080, height: 1920, background: serious ? C.sBg : C.bg, flexDirection: 'column', padding: '120px 80px 100px', fontFamily: 'Inter', color: fg },
    h('div', { justifyContent: 'space-between', alignItems: 'center' }, logo(76, serious), h('div', { fontFamily: 'Mono', fontSize: 26, color: serious ? '#4B5563' : C.muted }, `${e.place.city.toUpperCase()}`)),
    h('div', { marginTop: 90 }, serious ? h('div', { fontFamily: 'Mono', fontSize: 30, border: `2px solid ${C.sLine}`, borderRadius: 999, padding: '10px 24px' }, 'SUMMARY') : sticker(e, 26)),
    h('div', { marginTop: 40, fontFamily: 'Bricolage', fontSize: e.title.length > 70 ? 82 : 96, lineHeight: 1, letterSpacing: -3, color: fg }, clip(e.title, 110)),
    h('div', { marginTop: 56, flexDirection: 'column', gap: 28, background: serious ? '#FFFFFF' : C.yellow, color: C.black, border: `5px solid ${serious ? C.sLine : C.black}`, borderRadius: 36, padding: 48, boxShadow: serious ? 'none' : `14px 14px 0 ${C.violet}` },
      ...rows.map(([k, v]) => h('div', { flexDirection: 'column', gap: 6 }, h('div', { fontFamily: 'Mono', fontSize: 24, letterSpacing: 3, opacity: 0.7 }, k), h('div', { fontSize: 38, fontWeight: 600, lineHeight: 1.22 }, clip(v, 150))))),
    h('div', { marginTop: 'auto', alignItems: 'center', justifyContent: 'space-between' },
      h('div', { flexDirection: 'column', gap: 10 },
        h('div', { fontFamily: 'Mono', fontSize: 26, letterSpacing: 2, color: serious ? '#4B5563' : C.muted }, 'IS IT STILL ON?'),
        h('div', { fontFamily: 'Bricolage', fontSize: 150, lineHeight: 0.9, color: serious ? C.sInk : verdict(e) === 'YES' ? C.lime : C.yellow }, verdict(e))),
      h('div', { flexDirection: 'column', alignItems: 'flex-end', gap: 10, fontFamily: 'Mono', fontSize: 26, color: serious ? '#4B5563' : C.muted },
        h('div', {}, `${e.publishers} newsrooms checked`), h('div', { color: fg }, SITE_HOST))),
  );
}

function generic(): Node {
  return h('div', { width: 1200, height: 630, background: C.bg, flexDirection: 'column', padding: 64, fontFamily: 'Inter', color: C.ink },
    logo(64, false),
    h('div', { marginTop: 56, flexDirection: 'column', fontFamily: 'Bricolage', fontSize: 92, lineHeight: 0.95, letterSpacing: -3 },
      h('div', {}, 'Where the world is'),
      h('div', { alignItems: 'center', gap: 24 }, 'getting', h('div', { background: C.pink, color: C.black, border: `5px solid ${C.black}`, borderRadius: 18, padding: '0 18px', transform: 'rotate(-3deg)', boxShadow: `8px 8px 0 ${C.cyan}` }, 'LOUD')),
      h('div', {}, 'right now.')),
    h('div', { marginTop: 'auto', justifyContent: 'space-between', fontFamily: 'Mono', fontSize: 24, color: C.muted }, h('div', {}, 'Live protest tracker · every card checked twice'), h('div', { color: C.ink }, SITE_HOST)),
  );
}

async function render(node: Node, width: number, height: number): Promise<Buffer> {
  const t0 = Date.now();
  const svg = await satori(node as any, { width, height, fonts });
  const t1 = Date.now();
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
  if (process.env.CARDS_DEBUG) console.log(`  ${width}x${height}: satori ${t1 - t0}ms, resvg ${Date.now() - t1}ms, svg ${svg.length} bytes`);
  return png;
}

const cacheDir = path.resolve('.cache/cards');
const outDir = path.resolve('public/cards');
fs.mkdirSync(cacheDir, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

async function cached(key: string, make: () => Promise<Buffer>, dest: string) {
  const file = path.join(cacheDir, `${key}.png`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, await make());
  fs.copyFileSync(file, dest);
}

const t0 = Date.now();
// Unconfirmed reader reports get no share card (their pages use the generic image).
const events = [...loadEvents().values()].filter((e) => e.published && e.slug && e.stage === 'live');
let drawn = 0;
for (const e of events) {
  const content = JSON.stringify([VERSION, SITE_HOST, e.title, e.tea, e.vibe, e.status, e.isOngoing, e.severity, e.publishers, e.confidence, e.place.city, e.startedOn, e.kind]);
  const h1 = sha(content, 16);
  const before = fs.readdirSync(cacheDir).length;
  await cached(`og-${h1}`, () => render(og(e), 1200, 630), path.join(outDir, `${e.slug}-og.png`));
  await cached(`story-${h1}`, () => render(story(e), 1080, 1920), path.join(outDir, `${e.slug}-story.png`));
  drawn += fs.readdirSync(cacheDir).length - before;
}
await cached(`generic-${VERSION}-${sha(SITE_HOST, 6)}`, () => render(generic(), 1200, 630), path.resolve('public/og-default.png'));
console.log(`cards: ${events.length} events, ${drawn} images drawn, rest from cache (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
