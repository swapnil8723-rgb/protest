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

export const englishHash = (e: ProtestEvent) => sha(JSON.stringify(englishCard(e)), 16);

/** Shown on the site and not yet translated from its current English. */
export const needsTranslation = (e: ProtestEvent) =>
  e.published && !!e.slug && (e.stage === 'live' || e.origin === 'reader') && e.i18n?.of !== englishHash(e);

/** Turn one language's answer into EventText, or null if it does not line up. */
export function toEventText(e: ProtestEvent, t: TranslatedCard[string] | undefined): EventText | null {
  if (!t || typeof t !== 'object') return null;
  const src = englishCard(e);
  const arr = (a: unknown, n: number) => (Array.isArray(a) && a.length === n ? a.map((x) => clip(x, 400)) : null);
  const demands = arr(t.demands, src.demands.length);
  const updates = arr(t.updates, src.updates.length);
  const conflicts = arr(t.conflicts, src.conflicts.length);
  if (!demands || !updates || !conflicts) return null;
  const title = clip(t.title, 140);
  if (title.length < 4 || (src.summary && clip(t.summary, 10).length < 4) || (src.why && !clip(t.why, 10))) return null;
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
    let out: TranslatedCard;
    try {
      out = await ai.json<TranslatedCard>('translate', SYSTEM, translatePrompt(englishCard(e), TRANSLATE_TO), translateSchema(codes), `${e.id}-${hash}`);
    } catch (err) {
      if (err instanceof Pending) continue;
      if (err instanceof OverBudget) throw err;
      log(`translate: ${e.id} failed: ${(err as Error).message}`);
      continue;
    }
    const next: NonNullable<ProtestEvent['i18n']> = { of: hash, at: nowIso() };
    const bad: string[] = [];
    for (const code of codes) {
      const text = toEventText(e, out?.[code]);
      if (text) next[code as TransLang] = text;
      else bad.push(code);
    }
    if (bad.length) log(`translate: ${e.id} dropped ${bad.join(', ')} (did not match the English)`);
    e.i18n = next;
    done.push(e.id);
  }
  if (done.length) log(`translate: ${done.length} events into ${codes.join(', ')}`);
  return done;
}
