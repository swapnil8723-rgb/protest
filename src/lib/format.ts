import type { ProtestEvent } from '../../pipeline/types.ts';
import { fmtDate, fmtMonth, fmtNumber, useT, type Lang } from '../i18n/index.ts';

export const vibeClass = (e: ProtestEvent) => (e.status === 'scheduled' ? 'soon' : e.vibe);
export const vibeLabel = (e: ProtestEvent, lang: Lang = 'en') => useT(lang)(`vibe.${vibeClass(e)}` as 'vibe.soon');
export const isSerious = (e: ProtestEvent) => e.severity === 'serious';

/** "2026-10-04" → "Oct 4, 2026" (calendar date, no time zone shifting), in the page language. */
export const fmtDay = (day: string, withYear = true, lang: Lang = 'en') => fmtDate(day, lang, withYear);
export const monthYear = (day: string, lang: Lang = 'en') => fmtMonth(day, lang);

/** Server-side fallback for relative times; the client script refreshes these. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Deterministic −1.5°…1.5° tilt per card, so a page looks hand-stuck but never jumps between builds. */
export function tilt(slug: string): string {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${((Math.abs(h) % 31) - 15) / 10}deg`;
}

/** The big answer on every event page. */
export function stillOn(e: ProtestEvent, lang: Lang = 'en'): { verdict: string; kind: 'YES' | 'NO' | 'SOON'; line: string } {
  const t = useT(lang);
  const d = (day: string) => fmtDay(day, false, lang);
  if (e.status === 'scheduled') return { kind: 'SOON', verdict: t('still.soon'), line: t('still.announced', { date: d(e.startedOn) }) };
  if (e.isOngoing) {
    return {
      kind: 'YES',
      verdict: t('still.yes'),
      line: e.kind === 'multi-day' ? t('still.dayN', { n: dayNumber(e), date: d(e.startedOn) }) : t('still.today', { date: d(e.startedOn) }),
    };
  }
  const line =
    e.status === 'called-off' ? t('still.calledOff')
    : e.status === 'demands-met' ? t('still.demandsMet')
    : e.status === 'ended' ? (e.kind === 'one-day' ? t('still.oneDay', { date: d(e.endedOn ?? e.startedOn) }) : e.endedOn ? t('still.endedOn', { date: d(e.endedOn) }) : t('still.ended'))
    : t('still.quiet', { date: d(e.lastReportAt.slice(0, 10)) });
  return { kind: 'NO', verdict: t('still.no'), line: line.replace(/\.\.$/, '.') }; // "4. Okt." + full stop
}

function dayNumber(e: ProtestEvent): number {
  const d = Math.floor((Date.now() - Date.parse(e.startedOn + 'T00:00:00Z')) / 864e5) + 1;
  return Math.max(1, d);
}

export const fmtNum = (n: number, lang: Lang = 'en') => fmtNumber(n, lang);
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Meta descriptions: ≤ 158 chars, cut at a word boundary. */
export function metaDesc(s: string, n = 158): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/[\s,;:.।]+\S*$/, '') + '…';
}
