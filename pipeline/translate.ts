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
import { nowIso, pool, sha } from './util.ts';

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
const PROMPT_VERSION = 3;
export const englishHash = (e: ProtestEvent) => sha(JSON.stringify([PROMPT_VERSION, englishCard(e)]), 16);

const MAX_TRIES = 3;
/** Shown on the site and not yet (fully) translated from its current English. */
export const needsTranslation = (e: ProtestEvent, now = Date.now()) =>
  e.published && !!e.slug && (e.stage === 'live' || e.origin === 'reader') &&
  (e.i18n?.of !== englishHash(e) || (absent(e, now).length > 0 && (e.i18n.tries ?? 1) < MAX_TRIES));

type Target = (typeof TRANSLATE_TO)[number];
const has = (e: ProtestEvent, l: Target) => !!e.i18n?.[l.code];
/** Live, upcoming or reported in the last week: worth a newly added language. */
const current = (e: ProtestEvent, now: number) => e.isOngoing || e.status === 'scheduled' || now - Date.parse(e.lastReportAt || e.firstSeenAt) < 7 * 864e5;

/** The languages this event is translated into (see TRANSLATE_TO: legacy and since). */
export const wantedLangs = (e: ProtestEvent, now = Date.now()) =>
  TRANSLATE_TO.filter((l) => has(e, l) || (!l.legacy && (!l.since || (e.publishedAt ?? e.firstSeenAt) >= l.since || current(e, now))));

/** Wanted languages with no translation of the current English yet (never made, or kept from
 *  an older English after a failed retry, see `missing`). */
const absent = (e: ProtestEvent, now = Date.now()) => wantedLangs(e, now).filter((l) => !has(e, l) || e.i18n?.missing?.includes(l.code));

const filled = (x: unknown) => String(x ?? '').trim().length >= 2;

/** Why one language's answer cannot be used, or '' if it lines up with the English. */
export function mismatch(e: ProtestEvent, t: TranslatedCard[string] | undefined): string {
  if (!t || typeof t !== 'object') return 'missing';
  const src = englishCard(e);
  for (const k of ['demands', 'updates', 'conflicts'] as const) {
    const items = Array.isArray(t[k]) ? t[k].filter(filled) : null; // stray empty items are not items
    if (!items || items.length !== src[k].length) return `${k} ${items?.length ?? '?'}/${src[k].length}`;
  }
  if (!filled(t.title)) return 'title';
  // Plain length checks: never clip-then-measure (a summary starting "2 अक्टूबर…" or "À Bengaluru…"
  // clips to almost nothing at a word boundary).
  if (src.summary && String(t.summary ?? '').trim().length < Math.min(40, src.summary.length / 4)) return 'summary empty';
  if (src.why && !filled(t.why)) return 'why';
  return '';
}

/** Turn one language's answer into EventText, or null if it does not line up. */
export function toEventText(e: ProtestEvent, t: TranslatedCard[string] | undefined): EventText | null {
  if (mismatch(e, t)) return null;
  t = t!;
  const src = englishCard(e);
  const arr = (a: string[]) => a.filter(filled).map((x) => clip(x, 400));
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
    .filter((e) => needsTranslation(e))
    .sort((a, b) => (a.isOngoing !== b.isOngoing ? (a.isOngoing ? -1 : 1) : a.lastReportAt < b.lastReportAt ? 1 : -1))
    .slice(0, max);
  const done: string[] = [];
  // Three at a time (each call still waits for its slot in ai.ts): a busy run has to stay inside the Actions budget.
  let stopped: unknown;
  await pool(due, 3, async (e) => {
    if (stopped) return;
    try {
    const hash = englishHash(e);
    // Same English as last time: only the languages still missing are asked for again.
    const again = e.i18n?.of === hash;
    const langs = again ? absent(e) : wantedLangs(e);
    const codes = langs.map((l) => l.code);
    const ask = async (langs: typeof TRANSLATE_TO[number][], attempt: number) =>
      ai.json<TranslatedCard>('translate', SYSTEM, translatePrompt(englishCard(e), langs), translateSchema(langs.map((l) => l.code)), `${e.id}-${hash}${attempt ? `-r${attempt}` : ''}`);
    let out: TranslatedCard;
    try {
      out = await ask(langs, again ? 10 + (e.i18n!.tries ?? 1) : 0);
    } catch (err) {
      if (err instanceof Pending) return;
      if (err instanceof OverBudget) throw err;
      log(`translate: ${e.id} failed: ${(err as Error).message}`);
      return;
    }
    // One retry, in a smaller call, for the languages whose answer did not line up.
    const retry = langs.filter((l) => mismatch(e, out?.[l.code]));
    if (retry.length) {
      try {
        const second = await ask(retry, again ? 20 + (e.i18n!.tries ?? 1) : 1);
        for (const l of retry) if (!mismatch(e, second?.[l.code])) out[l.code] = second[l.code];
      } catch (err) {
        if (err instanceof OverBudget) throw err;
      }
    }
    // Keep every earlier translation and lay what came back now over it. A language whose new
    // answer does not line up keeps its previous text (marked missing, so it is asked again)
    // instead of losing its page: dropping it turned live /hi/p/... URLs into 404s.
    const next: NonNullable<ProtestEvent['i18n']> = again ? { ...e.i18n!, at: nowIso(), tries: (e.i18n!.tries ?? 1) + 1 } : { ...e.i18n, of: hash, at: nowIso(), tries: 1 };
    const missing = new Set<TransLang>(again ? (e.i18n!.missing ?? []).filter((c) => !codes.includes(c)) : []);
    const bad: string[] = [];
    for (const code of codes) {
      const text = toEventText(e, out?.[code]);
      if (text) next[code as TransLang] = text;
      else {
        missing.add(code as TransLang);
        bad.push(`${code} (${mismatch(e, out?.[code])})`);
      }
    }
    next.missing = missing.size ? [...missing] : undefined;
    if (bad.length) log(`translate: ${e.id} dropped ${bad.join(', ')}`);
    e.i18n = next;
    done.push(e.id);
    } catch (err) {
      stopped = err; // out of time or budget: the rest wait for the next run
    }
  });
  if (stopped) throw stopped;
  if (done.length) log(`translate: ${done.length} events`);
  return done;
}
