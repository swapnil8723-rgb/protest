// The home-page globe: canvas + d3-geo orthographic projection over Natural Earth's
// India point-of-view boundaries. No map provider, no token, no per-load cost.
// Motion per DESIGN.md §7: pulse rings, fly-to, idle spin — all off under reduced motion.
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

interface Pin {
  lat: number;
  lng: number;
  vibe: string;
  serious: boolean;
  title: string;
  url: string;
  place: string;
  why: string;
  label: string;
}

const root = document.querySelector<HTMLElement>('[data-globe]');
if (root) init(root);

function init(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const drawer = root.querySelector<HTMLElement>('[data-drawer]')!;
  const pins: Pin[] = JSON.parse(document.getElementById('pins')!.textContent || '[]');
  const S: { getTea: string; readSummary: string; close: string } = (() => {
    try {
      return JSON.parse(document.getElementById('i18n')?.textContent || '');
    } catch {
      return { getTea: 'Get the tea →', readSummary: 'Read the summary', close: 'Close' };
    }
  })();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const proj = geoOrthographic().precision(0.6).clipAngle(90);
  const path = geoPath(proj, ctx);
  const grat = geoGraticule10();
  let land: any = null;
  let borders: any = null;
  let rot: [number, number] = [-78, -18]; // start over India
  let zoom = 1;
  let base = 300;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let spinning = !reduce;
  let visible = true;
  let selected = -1;
  let colors = readColors();

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { ocean: v('--ocean'), land: v('--land'), line: v('--hairline'), ink: v('--ink'), pink: v('--pink'), reader: v('--reader'), cyan: v('--cyan'), lime: v('--lime'), violet: v('--violet'), muted: v('--muted') };
  }
  new MutationObserver(() => {
    colors = readColors();
    draw(performance.now());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    base = Math.min(W, H) / 2 - 8;
  }

  const vibeColor = (p: Pin) =>
    p.serious ? '#9CA3AF' : p.vibe === 'reader' ? colors.reader : p.vibe === 'cooling-down' ? colors.cyan : p.vibe === 'wrapped-up' ? colors.lime : colors.pink;

  function draw(t: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    proj.translate([W / 2, H / 2]).scale(base * zoom).rotate([rot[0], rot[1], 0]);
    const r = base * zoom;

    // atmosphere rim
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.92, W / 2, H / 2, r * 1.12);
    g.addColorStop(0, 'rgba(124,58,237,0.45)');
    g.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r * 1.12, 0, 2 * Math.PI);
    ctx.fill();

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = colors.ocean;
    ctx.fill();

    ctx.beginPath();
    path(grat);
    ctx.strokeStyle = colors.line;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (land) {
      ctx.beginPath();
      path(land);
      ctx.fillStyle = colors.land;
      ctx.fill();
      ctx.beginPath();
      path(borders);
      ctx.strokeStyle = colors.muted;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // pins: back-to-front, only on the visible hemisphere
    const center: [number, number] = [-rot[0], -rot[1]];
    pins.forEach((p, i) => {
      if (geoDistance([p.lng, p.lat], center) > Math.PI / 2 - 0.02) return;
      const xy = proj([p.lng, p.lat]);
      if (!xy) return;
      const c = vibeColor(p);
      const live = !p.serious && p.vibe !== 'wrapped-up';
      if (live && !reduce) {
        const k = ((t / 1800 + i * 0.137) % 1);
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 6 + k * 16, 0, 2 * Math.PI);
        ctx.strokeStyle = c;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], i === selected ? 8 : 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0B0B12';
      ctx.stroke();
    });
  }

  let last = performance.now();
  function frame(t: number) {
    const dt = Math.min(50, t - last);
    last = t;
    if (spinning && !dragging) rot = [rot[0] + dt * 0.006, rot[1]];
    if (visible) draw(t);
    requestAnimationFrame(frame);
  }

  // ── interaction ──
  let dragging = false;
  let start: { x: number; y: number; rot: [number, number] } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; zoom: number } | null = null;
  let moved = 0;

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    spinning = false;
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    } else {
      dragging = true;
      start = { x: ev.clientX, y: ev.clientY, rot: [...rot] as [number, number] };
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoom = clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), 0.9, 7);
      if (reduce) draw(performance.now());
      return;
    }
    if (!dragging || !start) return;
    const k = 0.25 / zoom;
    moved += Math.abs(ev.movementX) + Math.abs(ev.movementY);
    rot = [start.rot[0] + (ev.clientX - start.x) * k, clamp(start.rot[1] - (ev.clientY - start.y) * k, -80, 80)];
    if (reduce) draw(performance.now());
  });
  const end = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (dragging && moved < 6) pick(ev);
    dragging = false;
    start = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    (ev) => {
      // Plain wheel scrolls the page; ctrl+wheel (and trackpad pinch) zooms.
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      spinning = false;
      zoom = clamp(zoom * Math.exp(-ev.deltaY * 0.0015), 0.9, 7);
      if (reduce) draw(performance.now());
    },
    { passive: false },
  );

  function pick(ev: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const center: [number, number] = [-rot[0], -rot[1]];
    let best = -1;
    let bestD = 22;
    pins.forEach((p, i) => {
      if (geoDistance([p.lng, p.lat], center) > Math.PI / 2) return;
      const xy = proj([p.lng, p.lat]);
      if (!xy) return;
      const d = Math.hypot(xy[0] - x, xy[1] - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) select(best);
    else closeDrawer();
  }

  function flyTo(lng: number, lat: number, toZoom: number) {
    const from: [number, number] = [-rot[0], -rot[1]];
    const interp = geoInterpolate(from, [lng, lat]);
    const z0 = zoom;
    if (reduce) {
      rot = [-lng, -lat];
      zoom = toZoom;
      draw(performance.now());
      return;
    }
    const t0 = performance.now();
    const dur = 900;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const [x, y] = interp(e);
      rot = [-x, -y];
      zoom = z0 + (toZoom - z0) * e;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function select(i: number) {
    selected = i;
    spinning = false;
    const p = pins[i];
    flyTo(p.lng, p.lat, Math.max(zoom, 2.4));
    drawer.hidden = false;
    drawer.className = `drawer card ${p.serious ? 'serious' : 'v-' + p.vibe}`;
    drawer.innerHTML = '';
    const top = el('div', 'flex items-center justify-between gap-3');
    top.append(el('span', `sticker s-${p.serious ? 'tense' : p.vibe}`, p.label));
    const x = el('button', 'drawer-x', '×');
    x.setAttribute('aria-label', S.close);
    x.addEventListener('click', closeDrawer);
    top.append(x);
    const h = el('a', 'display mt-3 block text-[22px] leading-[1.05] no-underline', p.title) as HTMLAnchorElement;
    h.href = p.url;
    drawer.append(top, h, el('p', 'muted mt-1 text-[14px] font-semibold text-muted', p.place), el('p', 'mt-2 text-[15px] leading-snug', p.why));
    const go = el('a', 'btn btn-primary mt-4 w-full', p.serious ? S.readSummary : S.getTea) as HTMLAnchorElement;
    go.href = p.url;
    drawer.append(go);
    root.querySelector('[data-count]')!.textContent = `${i + 1} / ${pins.length}`;
  }
  function closeDrawer() {
    drawer.hidden = true;
    selected = -1;
  }
  function el(tag: string, cls: string, text?: string) {
    const n = document.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  root.querySelector('[data-prev]')?.addEventListener('click', () => pins.length && select((selected - 1 + pins.length) % pins.length));
  root.querySelector('[data-next]')?.addEventListener('click', () => pins.length && select((selected + 1) % pins.length));
  root.querySelector('[data-zoom-in]')?.addEventListener('click', () => { spinning = false; zoom = clamp(zoom * 1.5, 0.9, 7); draw(performance.now()); });
  root.querySelector('[data-zoom-out]')?.addEventListener('click', () => { zoom = clamp(zoom / 1.5, 0.9, 7); draw(performance.now()); });
  addEventListener('keydown', (ev) => ev.key === 'Escape' && closeDrawer());

  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  new ResizeObserver(() => {
    resize();
    draw(performance.now());
  }).observe(canvas);
  resize();
  draw(performance.now());

  fetch('/geo/globe.topo.json')
    .then((r) => r.json())
    .then((topo) => {
      land = feature(topo, topo.objects.countries);
      borders = mesh(topo, topo.objects.countries, (a: any, b: any) => a !== b);
      root.classList.add('ready');
      draw(performance.now());
    })
    .catch(() => {
      root.querySelector('[data-status]')!.textContent = 'Our map tripped over a placard. The list below still works.';
    });

  if (!reduce) requestAnimationFrame(frame);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
