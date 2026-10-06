// The "database": JSON files in DATA_DIR (the `data` branch checked out at ./data).
//   state.json          cursors, AI budget, run log
//   articles.json       every article seen (no body text), keyed by URL
//   events/<id>.json    one file per event — the site reads these
import fs from 'node:fs';
import path from 'node:path';
import type { Article, ProtestEvent, State } from './types.ts';
import { hoursSince } from './util.ts';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const p = (...s: string[]) => path.join(DATA_DIR, ...s);

const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** Write only when content changed, so git sees real diffs only. */
function writeJson(file: string, data: unknown, pretty = true) {
  const s = JSON.stringify(data, null, pretty ? 1 : 0) + '\n';
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === s) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  return true;
}

export function loadState(): State {
  return readJson<State>(p('state.json'), { aiCalls: { day: '', count: 0 }, runs: [] });
}
export function saveState(s: State) {
  s.runs = s.runs.slice(-50);
  writeJson(p('state.json'), s);
}

export function loadArticles(): Map<string, Article> {
  const obj = readJson<Record<string, Article>>(p('articles.json'), {});
  return new Map(Object.entries(obj));
}

/** Articles are pruned after 21 days unless an event cites them. */
export function saveArticles(articles: Map<string, Article>, events: Map<string, ProtestEvent>) {
  const cited = new Set<string>();
  for (const e of events.values()) for (const s of e.sources) cited.add(s.url);
  const keep: Record<string, Article> = {};
  for (const [url, a] of [...articles].sort(([x], [y]) => (x < y ? -1 : 1))) {
    if (hoursSince(a.firstSeenAt) > 21 * 24 && !cited.has(url) && !a.eventId) continue;
    keep[url] = a;
  }
  writeJson(p('articles.json'), keep, false);
}

export function loadEvents(dir = DATA_DIR): Map<string, ProtestEvent> {
  const d = path.join(dir, 'events');
  const out = new Map<string, ProtestEvent>();
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    const e = readJson<ProtestEvent | null>(path.join(d, f), null);
    if (e) out.set(e.id, e);
  }
  return out;
}

export function saveEvents(events: Map<string, ProtestEvent>, removed: string[] = []) {
  let changed = 0;
  for (const e of events.values()) if (writeJson(p('events', `${e.id}.json`), e)) changed++;
  for (const id of removed) fs.rmSync(p('events', `${id}.json`), { force: true });
  return changed;
}

/** URLs whose pages changed this run — consumed by the IndexNow ping after deploy. */
export function writeChanged(paths: string[]) {
  writeJson(p('changed.json'), { at: new Date().toISOString(), paths: [...new Set(paths)].sort() });
}
