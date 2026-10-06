// The only script every page loads (~1 KB): relative times, a stale-data warning,
// the theme toggle and the share buttons. Words come from the page's #i18n block.

const S: { locale: string; justNow: string; stale: string; copied: string } = (() => {
  try {
    return JSON.parse(document.getElementById('i18n')?.textContent || '');
  } catch {
    return { locale: 'en-US', justNow: 'just now', stale: 'Heads up: our checks paused {ago}. Statuses below may be out of date.', copied: 'Copied!' };
  }
})();
const rtf = new Intl.RelativeTimeFormat(S.locale, { numeric: 'always', style: 'long' });

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return S.justNow;
  const m = s / 60;
  if (m < 60) return rtf.format(-Math.round(m), 'minute');
  const h = m / 60;
  if (h < 36) return rtf.format(-Math.round(h), 'hour');
  return rtf.format(-Math.round(h / 24), 'day');
}

function tick() {
  for (const el of document.querySelectorAll<HTMLTimeElement>('time[data-rel]')) {
    const iso = el.getAttribute('datetime');
    if (iso) el.textContent = ago(iso);
  }
}
tick();
setInterval(tick, 60_000);

// If deploys stop, pages would keep saying "YES it's on". Say so instead.
const lastRun = document.body.dataset.lastRun;
// Checks run every 3 hours; warn once one has clearly been missed.
if (lastRun && Date.now() - Date.parse(lastRun) > 5 * 3.6e6) {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.className = 'stale-bar';
  bar.textContent = S.stale.replace('{ago}', ago(lastRun));
  document.body.prepend(bar);
}

document.getElementById('theme')?.addEventListener('click', () => {
  const root = document.documentElement;
  const light = root.dataset.theme !== 'light';
  if (light) root.dataset.theme = 'light';
  else delete root.dataset.theme;
  try {
    localStorage.setItem('theme', light ? 'light' : 'dark');
  } catch {}
});

// Share: native sheet with the 9:16 story image when the device supports files,
// otherwise download the image; link buttons copy the URL.
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-share-story]')) {
  btn.addEventListener('click', async () => {
    const src = btn.dataset.shareStory!;
    const url = btn.dataset.url!;
    const title = btn.dataset.title!;
    const label = btn.querySelector('span');
    const old = label?.textContent;
    if (label) label.textContent = '…';
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], src.split('/').pop()!, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title} — ${url}` });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') window.open(src, '_blank', 'noopener');
    } finally {
      if (label) label.textContent = old ?? '';
    }
  });
}

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const label = btn.querySelector('span');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ url: btn.dataset.copy!, title: document.title });
        return;
      }
      await navigator.clipboard.writeText(btn.dataset.copy!);
      if (label) {
        const old = label.textContent;
        label.textContent = S.copied;
        setTimeout(() => (label.textContent = old), 1600);
      }
    } catch {}
  });
}
