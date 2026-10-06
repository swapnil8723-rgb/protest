// Step: translate every published card into the site's other languages.
// One AI call per event covers all languages, and only when the English text changed
// (e.i18n.of = hash of the English). Translating the already-checked English, never the
// source articles, keeps one set of facts; a language whose answer does not line up
// with the English (missing items, empty title) is dropped and that page stays English.
import type { Ai } from './ai.ts';
import { OverBudget, Pending } from './ai.ts';
import { RULES, TRANSLATE_TO } from './config.ts';
import { SYSTEM, translatePrompt, translateSchema, type TranslatedCard } from './prompts.ts';
import type { EventText, ProtestEvent, TransLang } from './types.ts';
import { nowIso, sha } from './util.ts';

const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

/** The English text a reader sees, in the shape the translator gets. */
export function englishCard(e: ProtestEvent) {
  return {
    title: e.title,
    seo_title: e.seoTitle || e.title,
    why: e.tea.why,
    want: e.tea.want,
    changed: e.tea.changed,
    summary: e.summary,
    demands: e.demands,
    response: e.response,
    updates: e.updates.map((u) => u.text),
    conflicts: e.conflicts,
    crowd: e.numbers.crowd?.text ?? '',
    arrests: e.numbers.arrests?.text ?? '',
    injuries: e.numbers.injuries?.text ?? '',
    deaths: e.numbers.deaths?.text ?? '',
  };
}

/** Bump when the translation prompt changes, so every card is translated again. */
const PROMPT_VERSION = 2;
export const englishHash = (e: ProtestEvent) => sha(JSON.stringify([PROMPT_VERSION, englishCard(e)]), 16);

/** Shown on the site and not yet translated from its current English. */
export const needsTranslation = (e: ProtestEvent) =>
  e.published && !!e.slug && (e.stage === 'live' || e.origin === 'reader') && e.i18n?.of !== englishHash(e);

/** Why one language's answer cannot be used, or '' if it lines up with the English. */
export function mismatch(e: ProtestEvent, t: TranslatedCard[string] | undefined): string {
  if (!t || typeof t !== 'object') return 'missing';
  const src = englishCard(e);
  for (const k of ['demands', 'updates', 'conflicts'] as const) {
    const items = Array.isArray(t[k]) ? t[k].filter((x) => clip(x, 10)) : null; // stray empty items are not items
    if (!items || items.length !== src[k].length) return `${k} ${items?.length ?? '?'}/${src[k].length}`;
  }
  if (clip(t.title, 140).length < 4) return 'title';
  if (src.summary && clip(t.summary, 10).length < 4) return 'summary';
  if (src.why && !clip(t.why, 10)) return 'why';
  return '';
}

/** Turn one language's answer into EventText, or null if it does not line up. */
export function toEventText(e: ProtestEvent, t: TranslatedCard[string] | undefined): EventText | null {
  if (mismatch(e, t)) return null;
  t = t!;
  const src = englishCard(e);
  const arr = (a: string[]) => a.filter((x) => clip(x, 10)).map((x) => clip(x, 400));
  const demands = arr(t.demands);
  const updates = arr(t.updates);
  const conflicts = arr(t.conflicts);
  const title = clip(t.title, 140);
  const num = (k: 'crowd' | 'arrests' | 'injuries' | 'deaths') => (src[k] ? clip(t[k], 160) || undefined : undefined);
  return {
    title,
    seoTitle: clip(t.seo_title || t.title, 70),
    tea: { why: clip(t.why, 240), want: clip(t.want, 240), changed: clip(t.changed, 260) },
    summary: clip(t.summary, 2400),
    demands,
    response: clip(t.response, 500),
    updates,
    conflicts,
    numbers: { crowd: num('crowd'), arrests: num('arrests'), injuries: num('injuries'), deaths: num('deaths') },
  };
}

export async function translate(ai: Ai, events: Map<string, ProtestEvent>, log: (s: string) => void, max = RULES.translatePerRun): Promise<string[]> {
  // Live events first (readers are waiting), then the newest.
  const due = [...events.values()]
    .filter(needsTranslation)
    .sort((a, b) => (a.isOngoing !== b.isOngoing ? (a.isOngoing ? -1 : 1) : a.lastReportAt < b.lastReportAt ? 1 : -1))
    .slice(0, max);
  const codes = TRANSLATE_TO.map((l) => l.code);
  const done: string[] = [];
  for (const e of due) {
    const hash = englishHash(e);
    const ask = async (langs: typeof TRANSLATE_TO[number][], attempt: number) =>
      ai.json<TranslatedCard>('translate', SYSTEM, translatePrompt(englishCard(e), langs), translateSchema(langs.map((l) => l.code)), `${e.id}-${hash}${attempt ? `-r${attempt}` : ''}`);
    let out: TranslatedCard;
    try {
      out = await ask([...TRANSLATE_TO], 0);
    } catch (err) {
      if (err instanceof Pending) continue;
      if (err instanceof OverBudget) throw err;
      log(`translate: ${e.id} failed: ${(err as Error).message}`);
      continue;
    }
    // One retry, in a smaller call, for the languages whose answer did not line up.
    const retry = TRANSLATE_TO.filter((l) => mismatch(e, out?.[l.code]));
    if (retry.length) {
      try {
        const again = await ask(retry, 1);
        for (const l of retry) if (!mismatch(e, again?.[l.code])) out[l.code] = again[l.code];
      } catch (err) {
        if (err instanceof OverBudget) throw err;
      }
    }
    const next: NonNullable<ProtestEvent['i18n']> = { of: hash, at: nowIso() };
    const bad: string[] = [];
    for (const code of codes) {
      const text = toEventText(e, out?.[code]);
      if (text) next[code as TransLang] = text;
      else bad.push(`${code} (${mismatch(e, out?.[code])})`);
    }
    if (bad.length) log(`translate: ${e.id} dropped ${bad.join(', ')}`);
    e.i18n = next;
    done.push(e.id);
  }
  if (done.length) log(`translate: ${done.length} events into ${codes.join(', ')}`);
  return done;
}
