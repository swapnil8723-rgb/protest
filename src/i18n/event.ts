// An event in the page language: the pipeline's translation laid over the English,
// so components keep reading e.title, e.tea... Untranslated events stay English.
import type { ProtestEvent } from '../../pipeline/types.ts';
import type { Lang } from './index.ts';

export const hasLang = (e: ProtestEvent, lang: Lang) => lang === 'en' || !!e.i18n?.[lang];

export function loc(e: ProtestEvent, lang: Lang): ProtestEvent {
  if (lang === 'en') return e;
  const t = e.i18n?.[lang];
  if (!t) return e;
  const num = (k: keyof ProtestEvent['numbers']) => {
    const f = e.numbers[k];
    return f ? { ...f, text: t.numbers[k] || f.text, en: f.text } : undefined;
  };
  return {
    ...e,
    title: t.title,
    seoTitle: t.seoTitle,
    tea: t.tea,
    summary: t.summary,
    demands: t.demands,
    response: t.response,
    updates: e.updates.map((u, i) => ({ ...u, text: t.updates[i] || u.text })),
    conflicts: t.conflicts,
    numbers: { crowd: num('crowd'), arrests: num('arrests'), injuries: num('injuries'), deaths: num('deaths') },
  };
}
