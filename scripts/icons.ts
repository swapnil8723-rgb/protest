// Render the favicon SVG to the PNG/ICO sizes browsers and app shells ask for.
// usage: npm run icons
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const png = (size: number) => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

for (const [file, size] of [['favicon-48x48.png', 48], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
  fs.writeFileSync(`public/${file}`, size === 180 ? padded(size) : png(size));
}

// iOS crops nothing but adds no background: give the touch icon a solid base.
function padded(size: number) {
  const inner = svg.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 80 80"><rect x="-8" y="-8" width="80" height="80" fill="#0B0B12"/>');
  return Buffer.from(new Resvg(inner, { fitTo: { mode: 'width', value: size } }).render().asPng());
}

// favicon.ico = ICO container with embedded 32px and 48px PNGs
const imgs = [32, 48].map((s) => ({ s, data: png(s) }));
const header = Buffer.alloc(6 + 16 * imgs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(imgs.length, 4);
let offset = header.length;
imgs.forEach(({ s, data }, i) => {
  const o = 6 + i * 16;
  header.writeUInt8(s, o);
  header.writeUInt8(s, o + 1);
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(data.length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += data.length;
});
fs.writeFileSync('public/favicon.ico', Buffer.concat([header, ...imgs.map((i) => i.data)]));
console.log('icons written');
