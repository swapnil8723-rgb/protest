import type { ProtestEvent } from '../../pipeline/types.ts';

export const VIBE_LABEL: Record<ProtestEvent['vibe'], string> = {
  'heating-up': 'Heating up',
  'peak-loud': 'Peak loud',
  'cooling-down': 'Cooling down',
  'wrapped-up': 'Wrapped up',
  tense: 'Serious',
};

export const vibeLabel = (e: ProtestEvent) => (e.status === 'scheduled' ? 'Coming up' : VIBE_LABEL[e.vibe]);
export const vibeClass = (e: ProtestEvent) => (e.status === 'scheduled' ? 'soon' : e.vibe);
export const isSerious = (e: ProtestEvent) => e.severity === 'serious';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-04" → "Oct 4, 2026" (calendar date, no time zone shifting). */
export function fmtDay(day: string, withYear = true): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return `${MON[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}
export const monthYear = (day: string) => {
  const [y, m] = day.split('-').map(Number);
  return `${MON[m - 1]} ${y}`;
};

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
export function stillOn(e: ProtestEvent): { verdict: 'YES' | 'NO' | 'SOON'; line: string } {
  if (e.status === 'scheduled') return { verdict: 'SOON', line: `Announced for ${fmtDay(e.startedOn, false)}. Not started yet.` };
  if (e.isOngoing) {
    return {
      verdict: 'YES',
      line: e.kind === 'multi-day' ? `Day ${dayNumber(e)} and counting, since ${fmtDay(e.startedOn, false)}.` : `Happening today, ${fmtDay(e.startedOn, false)}.`,
    };
  }
  const why: Record<string, string> = {
    'called-off': 'Organisers called it off',
    'demands-met': 'Ended after demands were met',
    ended: e.kind === 'one-day' ? `It was a one-day action on ${fmtDay(e.endedOn ?? e.startedOn, false)}` : `Ended ${e.endedOn ? 'on ' + fmtDay(e.endedOn, false) : ''}`.trim(),
    ongoing: `No new reports since ${fmtDay(e.lastReportAt.slice(0, 10), false)}`,
  };
  return { verdict: 'NO', line: `${why[e.status] ?? why.ongoing}.` };
}

function dayNumber(e: ProtestEvent): number {
  const d = Math.floor((Date.now() - Date.parse(e.startedOn + 'T00:00:00Z')) / 864e5) + 1;
  return Math.max(1, d);
}

export const fmtNum = (n: number) => n.toLocaleString('en-US');
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Meta descriptions: ≤ 158 chars, cut at a word boundary. */
export function metaDesc(s: string, n = 158): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '') + '…';
}
